# SpikeSense — build_data.py
# Lê os JSONs oficiais do Hackathon (data/**/*.json) e gera public/data.json compacto.
# Formato de entrada: match details da API Henrik (fornecido pela organização no Drive).
import json, glob, os, re, sys, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, 'data')
OUT = os.path.join(ROOT, 'public', 'data.json')

FN_RE = re.compile(r'^(?P<event>[A-Z0-9]+)_(?P<num>[0-9a-z]+)_(?P<date>\d{2}-\d{2}-\d{2})_(?P<rest>.+)\.json$')

def parse_filename(fn):
    m = FN_RE.match(fn)
    if not m: return None
    rest = m.group('rest')
    # rest: teamA_scoreA_x_scoreB_teamB_map (times podem ter varias palavras)
    m2 = re.match(r'^(.+)_(\d+)_x_(\d+)_(.+)_([a-z]+)$', rest)
    if not m2: return None
    team_a, score_a, score_b, team_b, map_slug = m2.group(1), int(m2.group(2)), int(m2.group(3)), m2.group(4), m2.group(5)
    dd, mm, yy = m.group('date').split('-')
    date = f'20{yy}-{mm}-{dd}'
    return dict(event=m.group('event'), num=m.group('num'), date=date,
                team_a=team_a.replace('_', ' ').title(), team_b=team_b.replace('_', ' ').title(),
                score_a=score_a, score_b=score_b, map_slug=map_slug)

def name_by_score(teams, name_a, score_a, name_b, score_b):
    """teams = [{'teamId':'Red','roundsWon':n},{'teamId':'Blue',...}]; liga nome do arquivo ao teamId pelo placar."""
    by = {t['teamId']: t for t in teams}
    for tid, t in by.items():
        if t.get('roundsWon') == score_a and by.get(other(tid, teams), {}).get('roundsWon') == score_b:
            return {tid: name_a, other(tid, teams): name_b}
    # fallback (empate em OT): assume ordem do arquivo = Red, Blue
    return {teams[0]['teamId']: name_a, teams[1]['teamId']: name_b}

def other(tid, teams):
    for t in teams:
        if t['teamId'] != tid: return t['teamId']
    return tid

def main():
    files = sorted(glob.glob(os.path.join(DATA_DIR, '**', '*.json'), recursive=True))
    matches, skipped = [], []
    for f in files:
        fn = os.path.basename(f)
        meta = parse_filename(fn)
        if not meta:
            skipped.append(fn); continue
        try:
            d = json.load(open(f, encoding='utf-8'))
        except Exception as e:
            skipped.append(f'{fn}: {e}'); continue
        if not d.get('players') or not d.get('roundResults'):
            skipped.append(f'{fn}: estrutura inesperada'); continue
        mi = d.get('matchInfo', {})
        tmap = name_by_score(d['teams'], meta['team_a'], meta['score_a'], meta['team_b'], meta['score_b'])
        players = []
        for p in d['players']:
            st = p.get('stats', {})
            players.append({
                'p': p['puuid'], 'n': p.get('gameName', '?') + '#' + p.get('tagLine', ''),
                't': p['teamId'], 'a': p.get('characterId', ''),
                'k': st.get('kills', 0), 'd': st.get('deaths', 0), 'as': st.get('assists', 0),
                'sc': st.get('score', 0), 'rp': st.get('roundsPlayed', 0),
                'ab': st.get('abilityCasts', {}) or {},
            })
        rounds = []
        for r in d['roundResults']:
            kills = []
            dmg = []
            econ = {}
            for ps in r.get('playerStats', []):
                pu = ps['puuid']
                ec = ps.get('economy', {}) or {}
                if ec:
                    econ[pu] = [ec.get('loadoutValue', 0), ec.get('weapon', ''), ec.get('armor', ''), ec.get('spent', 0), ec.get('remaining', 0)]
                for k in ps.get('kills', []) or []:
                    fd = (k.get('finishingDamage') or {})
                    kills.append({
                        't': round(k.get('timeSinceRoundStartMillis', 0) / 1000, 1),
                        'k': k.get('killer'), 'v': k.get('victim'),
                        'x': (k.get('victimLocation') or {}).get('x', 0), 'y': (k.get('victimLocation') or {}).get('y', 0),
                        'w': fd.get('damageItem', ''), 'dt': fd.get('damageType', ''),
                        'as': [a for a in (k.get('assistants') or [])],
                    })
                for dd in ps.get('damage', []) or []:
                    dmg.append([pu, dd.get('receiver', ''), dd.get('damage', 0), dd.get('headshots', 0), dd.get('bodyshots', 0), dd.get('legshots', 0)])
            rounds.append({
                'n': r['roundNum'], 'res': r.get('roundResult', ''), 'code': r.get('roundResultCode', ''),
                'win': r.get('winningTeam', ''), 'wr': r.get('winningTeamRole', ''), 'site': r.get('plantSite', '') or '',
                'plant': round(r['plantRoundTime'] / 1000, 1) if r.get('plantRoundTime') else None,
                'defuse': round(r['defuseRoundTime'] / 1000, 1) if r.get('defuseRoundTime') else None,
                'kp': r.get('bombPlanter', ''), 'kd': r.get('bombDefuser', ''),
                'kills': kills, 'dmg': dmg, 'econ': econ,
            })
        matches.append({
            'id': mi.get('matchId', fn), 'event': meta['event'], 'num': meta['num'], 'date': meta['date'],
            'map': mi.get('mapId', ''), 'dur': round(mi.get('gameLengthMillis', 0) / 1000),
            'ver': mi.get('gameVersion', ''),
            'teams': {t['teamId']: {'name': tmap.get(t['teamId'], t['teamId']), 'won': t.get('roundsWon', 0)} for t in d['teams']},
            'players': players, 'rounds': rounds,
        })
    # dataset único com índice de jogadores (puuid -> nome canônico mais frequente)
    pnames = {}
    for m in matches:
        for p in m['players']:
            pnames.setdefault(p['p'], {})[p['n']] = pnames.setdefault(p['p'], {}).get(p['n'], 0) + 1
    pindex = {pu: max(c.items(), key=lambda kv: kv[1])[0] for pu, c in pnames.items()}
    out = {'generated': datetime.datetime.now().isoformat(timespec='seconds'), 'matches': matches, 'players': pindex}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'OK: {len(matches)} partidas -> {OUT} ({os.path.getsize(OUT)/1e6:.1f} MB)')
    if skipped:
        print('IGNORADOS:'); [print(' ', s) for s in skipped[:10]]
    # resumo por evento
    evts = {}
    for m in matches: evts[m['event']] = evts.get(m['event'], 0) + 1
    print('por evento:', evts)

if __name__ == '__main__':
    main()
