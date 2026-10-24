# SpikeSense — build_round_index.py
# Gera public/rounds-index.json: 1 documento por round com narrativa rica em PT
# + embeddings via Ollama (nomic-embed-text por padrão). Fallback lexical sem Ollama.
# Env: OLLAMA_URL (padrão http://localhost:11434), EMBED_MODEL (padrão nomic-embed-text)
import json, glob, os, sys, unicodedata, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, 'data')
OUT = os.path.join(ROOT, 'public', 'rounds-index.json')
M = json.load(open(os.path.join(ROOT, 'src', 'mappings.json'), encoding='utf-8'))
MAPS = {k: v['n'] for k, v in M.get('maps', {}).items()}
WEAPONS = {k.lower(): v['n'] for k, v in M.get('weapons', {}).items()}
WEAPONS.update({k.lower(): v['n'] for k, v in M.get('skins', {}).items()})

def map_name(map_id):
    return MAPS.get(map_id, (map_id or '?').split('/')[-1])

def weapon(uuid, dt):
    if dt == 'Bomb': return 'Spike'
    if dt == 'Melee': return 'Faca'
    if dt == 'Ability': return 'Habilidade'
    return WEAPONS.get((uuid or '').lower(), 'arma')

def mmss(s):
    s = s or 0
    return f'{int(s // 60)}:{int(s % 60):02d}'

def buy_type(n, loadout):
    if n in (0, 12): return 'pistola'
    if loadout < 8000: return 'eco'
    if loadout < 17000: return 'force'
    if loadout < 26000: return 'semi'
    return 'full'

def normalize(s):
    s = unicodedata.normalize('NFD', s.lower())
    return ''.join(c for c in s if unicodedata.category(c) != 'Mn')

def ollama_embed(texts):
    url = os.environ.get('OLLAMA_URL', 'http://localhost:11434')
    model = os.environ.get('EMBED_MODEL', 'nomic-embed-text')
    req = urllib.request.Request(
        f'{url}/api/embed',
        data=json.dumps({'model': model, 'input': texts}).encode(),
        headers={'Content-Type': 'application/json'}, method='POST')
    r = json.load(urllib.request.urlopen(req, timeout=300))
    return r['embeddings']

def main():
    files = sorted(glob.glob(os.path.join(DATA_DIR, '**', '*.json'), recursive=True))
    docs = []
    for f in files:
        fn = os.path.basename(f)[:-5]
        seg = fn.split('_')
        event = seg[0] if seg else ''
        date = f'20{seg[2][-2:]}-{seg[2][:2]}-{seg[2][3:5]}' if len(seg) > 2 and len(seg[2]) >= 5 else ''
        d = json.load(open(f, encoding='utf-8'))
        mi = d.get('matchInfo', {})
        players = {p['puuid']: p for p in d.get('players', [])}
        teams = {t['teamId']: t for t in d.get('teams', [])}
        tred = teams.get('Red', {}).get('name', 'Red')
        tblue = teams.get('Blue', {}).get('name', 'Blue')
        mapn = map_name(mi.get('mapId', ''))
        rounds = d.get('roundResults', [])
        won = {'Red': 0, 'Blue': 0}
        for i, r in enumerate(rounds):
            winner_t = r['winningTeam']
            loser_t = 'Blue' if winner_t == 'Red' else 'Red'
            won[winner_t] += 1
            kills = sorted(r.get('kills') or [], key=lambda k: k.get('timeSinceRoundStartMillis', 0))
            loadouts = {'Red': [], 'Blue': []}
            for ps in r.get('playerStats', []):
                p = players.get(ps.get('puuid'), {})
                ec = ps.get('economy') or {}
                if p.get('teamId') and ec:
                    loadouts[p['teamId']].append(ec.get('loadoutValue', 0))
            avg = {t: (sum(v) / len(v) * 5 if v else 0) for t, v in loadouts.items()}
            buy = {t: buy_type(r['roundNum'], avg[t]) for t in avg}
            atk = None
            if r.get('winningTeamRole') == 'Attacker': atk = winner_t
            elif r.get('winningTeamRole') == 'Defender': atk = loser_t
            atk_name = teams.get(atk, {}).get('name') if atk else '?'
            def_name = teams.get(('Blue' if atk == 'Red' else 'Red') if atk else 'Red', {}).get('name', '?')
            site = r.get('plantSite') or ''
            plant = r.get('plantRoundTime')

            parts = [f'Round {r["roundNum"] + 1} em {mapn}: {tred} contra {tblue}. Placar antes do round: {tred} {won["Red"] - (1 if winner_t == "Red" else 0)} x {won["Blue"] - (1 if winner_t == "Blue" else 0)} {tblue}.']
            if atk:
                parts.append(f'{atk_name} atacava com compra {buy[atk]} ({int(avg[atk])} créditos) contra compra {buy[def_name == tred and "Red" or "Blue"]} de {def_name}.')
            if site and plant:
                parts.append(f'Plant da spike no site {site} aos {mmss(plant / 1000)}.')
            if r.get('defuseRoundTime'):
                parts.append('Spike desarmanda com defuse.')
            for k in kills:
                kn = players.get(k.get('killer'), {}).get('gameName', '?')
                vn = players.get(k.get('victim'), {}).get('gameName', '?')
                fd = k.get('finishingDamage') or {}
                parts.append(f'{mmss((k.get("timeSinceRoundStartMillis") or 0) / 1000)} {kn} eliminou {vn} com {weapon(fd.get("damageItem"), fd.get("damageType"))}.')
            # clutch 1vX
            alive = set(players.keys())
            clutch_txt = ''
            for k in kills:
                alive.discard(k.get('victim'))
                for t in ('Red', 'Blue'):
                    o = 'Blue' if t == 'Red' else 'Red'
                    a_t = sum(1 for pu in alive if players[pu].get('teamId') == t)
                    a_o = sum(1 for pu in alive if players[pu].get('teamId') == o)
                    if a_t == 1 and a_o >= 2 and not clutch_txt:
                        solo = next((players[pu].get('gameName', '?') for pu in alive if players[pu].get('teamId') == t), '?')
                        res = 'ganhou' if winner_t == t else 'perdeu'
                        clutch_txt = f'Clutch 1v{a_o} de {solo} ({res}).'
            if clutch_txt:
                parts.append(clutch_txt)
            tipos = []
            if buy['Red'] == 'pistola' or buy['Blue'] == 'pistola':
                tipos.append('round de pistola')
            if buy[loser_t] in ('full', 'semi') and buy[winner_t] in ('eco', 'pistola'):
                tipos.append(f'anti-eco perdido por {teams.get(loser_t, {}).get("name", loser_t)}')
            if site and plant and atk == loser_t:
                tipos.append(f'pós-plant perdido por {teams.get(loser_t, {}).get("name", loser_t)}')
            if site and plant and atk != loser_t:
                tipos.append(f'retake perdido por {teams.get(loser_t, {}).get("name", loser_t)}')
            parts.append(f'Round vencido por {teams.get(winner_t, {}).get("name", winner_t)}' + (f' — {", ".join(tipos)}' if tipos else '') + '.')
            raw = ' '.join(parts)
            docs.append({
                'id': f'{mi.get("matchId", fn)}#{r["roundNum"]}',
                'matchId': mi.get('matchId', fn),
                'round': r['roundNum'],
                'map': mapn,
                'event': event,
                'date': date,
                'text': normalize(raw),
                'raw': raw,
                'vector': None,
            })

    # embeddings via Ollama
    try:
        print('embeddings via Ollama (nomic-embed-text)…')
        B = 32
        for i in range(0, len(docs), B):
            chunk = docs[i:i + B]
            vecs = ollama_embed([d['raw'] for d in chunk])
            for d, v in zip(chunk, vecs):
                d['vector'] = [round(x, 5) for x in v]
            if (i // B) % 10 == 0:
                print(f'  {min(i + B, len(docs))}/{len(docs)}')
        print(f'  {len(docs)}/{len(docs)} ok')
    except Exception as e:
        print(f'SEM embeddings ({e}) — índice lexical')
        for d in docs:
            d['vector'] = None

    dim = len(docs[0]['vector']) if docs and docs[0]['vector'] else 0
    out = {'dim': dim, 'model': 'nomic-embed-text', 'docs': docs}
    json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'OK: {len(docs)} rounds, dim {dim} -> {OUT} ({os.path.getsize(OUT) / 1e6:.1f} MB)')

if __name__ == '__main__':
    main()
