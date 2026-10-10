"""The research ledger: an ActiveGraph event store that records what was planned, run and
concluded.

    python -m packing.ledger ingest <campaign-id>   # plan + new results -> events; behaviors fire
    python -m packing.ledger finding "<text>" --evidence <cell or campaign id> ... [--campaign C]
    python -m packing.ledger close <campaign-id> "<decision taken>"
    python -m packing.ledger export                  # ledger/events.jsonl (committed)

Raw runs stay in campaigns/<C>/runs*.jsonl. The ledger stores, per ingested file, its SHA-256 and
per-cell statistics (a cell is campaign x family x n x method x budget x config).

Unlike the parent project there is no polish/certify chain: concave families have no external
records, so every claim is head-to-head at matched budget. Convex control families keep their
catalogue values for "reached" counts only.

Behaviors (reactive, in order of causation):
  plan        campaign.planned -> campaign object
  summarize   runs.ingested    -> cell objects with per-cell statistics
  recorder    finding.recorded / campaign.closed -> finding and decision objects with evidence edges
"""
import argparse, glob, hashlib, json, os, statistics, sys, time
import activegraph as ag
from activegraph import Graph, Runtime, behavior, Event

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DB = os.path.join(ROOT, 'ledger', 'ledger.sqlite')


def catalog(fam):
    return json.load(open(os.path.join(ROOT, 'catalog', fam + '.json')))


def _key(*parts):
    return '/'.join(str(p) for p in parts)


def build_behaviors(H):
    """Behaviors read the full graph H['G'] (set after loading) and write through the behavior graph."""

    def find(type_, **where):
        objs = H['G'].objects(type_, where=where)
        return objs[0] if objs else None

    @behavior(name='plan', on=['campaign.planned'])
    def plan(event, graph, ctx):
        p = event.payload
        if not find('campaign', cid=p['id']):
            graph.add_object('campaign', {'cid': p['id'], 'title': p['title'], 'question': p['question'],
                                          'hypothesis': p.get('hypothesis'), 'decision_rule': p['decision_rule'],
                                          'created': p.get('created'), 'plan_sha256': p.get('plan_sha256'),
                                          'status': 'planned'})

    @behavior(name='summarize', on=['runs.ingested'])
    def summarize(event, graph, ctx):
        p = event.payload
        camp = find('campaign', cid=p['campaign'])
        have_cell = {o.data['cell']: o for o in H['G'].objects('cell') if o.data.get('campaign') == p['campaign']}
        for c in p['cells']:
            key = c['cell']
            prev = have_cell.get(key)
            if prev:
                graph.patch_object(prev.id, c)
                cell_id = prev.id
            else:
                o = graph.add_object('cell', c)
                cell_id = o.id
                if camp:
                    graph.add_relation(cell_id, camp.id, 'in_campaign')
        if camp:
            graph.patch_object(camp.id, {'status': 'running' if not p.get('complete') else 'complete'})

    @behavior(name='recorder', on=['finding.recorded', 'campaign.closed'])
    def recorder(event, graph, ctx):
        p = event.payload
        if event.type == 'finding.recorded':
            o = graph.add_object('finding', {'text': p['text'], 'campaign': p.get('campaign'), 'date': p.get('date'), 'evidence': p.get('evidence', [])})
            for ev in p.get('evidence', []):
                tgt = find('cell', cell=ev) or find('campaign', cid=ev)
                if tgt:
                    graph.add_relation(o.id, tgt.id, 'supported_by')
        else:
            camp = find('campaign', cid=p['campaign'])
            if camp:
                graph.patch_object(camp.id, {'status': 'closed', 'decision': p['decision'], 'closed': p.get('date')})

    return [plan, summarize, recorder]


def open_ledger():
    ag.clear_registry()
    os.makedirs(os.path.dirname(DB), exist_ok=True)
    H = {}
    if os.path.exists(DB):
        rt = Runtime.load(DB, behaviors=build_behaviors(H))
    else:
        rt = Runtime(Graph(), behaviors=build_behaviors(H), persist_to=DB)
    H['G'] = rt.graph
    return rt, rt.graph


def emit(G, type_, payload):
    G.emit(Event(id=G.ids.event(), type=type_, payload=payload))


def _cells(campaign, rows):
    by = {}
    for r in rows:
        if 'error' in r:
            continue
        by.setdefault(_key(campaign, r['family'], 'n%d' % r['n'], r['method'], 'B%s' % r['budget'], r['config']), []).append(r)
    cells = []
    for key, rs in sorted(by.items()):
        rs.sort(key=lambda r: r['L'])
        gaps = [r['gap'] for r in rs if r['gap'] is not None]
        r0 = rs[0]
        cells.append({'cell': key, 'campaign': campaign, 'family': r0['family'], 'n': r0['n'], 'method': r0['method'],
                      'budget': r0['budget'], 'config': r0['config'], 'runs': len(rs), 'record': r0.get('record'),
                      'best_L': rs[0]['L'], 'best_run': rs[0]['id'], 'best_gap': rs[0]['gap'],
                      'median_gap': statistics.median(gaps) if gaps else None,
                      'hits_1e3': sum(g < 1e-3 for g in gaps), 'hits_1e4': sum(g < 1e-4 for g in gaps),
                      'ms_mean': round(statistics.mean(r['ms'] for r in rs), 1),
                      'evals_mean': round(statistics.mean(r['evals'] for r in rs))})
    return cells


def ingest(campaign, opened=None):
    rt, G = opened or open_ledger()
    cdir = os.path.join(ROOT, 'campaigns', campaign)
    plan = json.load(open(os.path.join(cdir, 'plan.json')))
    if not G.objects('campaign', where={'cid': campaign}):
        emit(G, 'campaign.planned', {k: plan.get(k) for k in ('id', 'title', 'question', 'hypothesis', 'decision_rule', 'created')}
             | {'plan_sha256': hashlib.sha256(open(os.path.join(cdir, 'plan.json'), 'rb').read()).hexdigest()})
        rt.run_until_idle()
    rows, digests = [], {}
    for f in sorted(glob.glob(os.path.join(cdir, 'runs*.jsonl'))):
        rel = os.path.relpath(f, ROOT)
        data = open(f, 'rb').read()
        digests[rel] = hashlib.sha256(data).hexdigest()
        for line in data.decode().splitlines():
            if line.strip():
                rows.append(json.loads(line))
    errors = [r for r in rows if 'error' in r]
    emit(G, 'runs.ingested', {'campaign': campaign, 'files': digests, 'runs': len(rows), 'errors': len(errors),
                              'error_ids': [r['id'] for r in errors][:50], 'cells': _cells(campaign, rows)})
    rt.run_until_idle()
    print(f'ingested {campaign}: {len(rows)} runs, {len(errors)} errors; ledger has {len(G.events)} events')


NOTES = os.path.join(ROOT, 'ledger', 'notes.jsonl')   # the researcher's inputs (findings, decisions), append-only


def _note(type_, payload, emit_now=True):
    with open(NOTES, 'a') as f:
        f.write(json.dumps({'type': type_, **payload}) + '\n')
    if emit_now:
        rt, G = open_ledger()
        emit(G, type_, payload)
        rt.run_until_idle()


def finding(text, evidence, campaign=None):
    _note('finding.recorded', {'text': text, 'evidence': evidence, 'campaign': campaign, 'date': time.strftime('%Y-%m-%d')})


def close(campaign, decision):
    _note('campaign.closed', {'campaign': campaign, 'decision': decision, 'date': time.strftime('%Y-%m-%d')})


def rebuild(upto=None):
    """Recreate the ledger from its inputs: for each campaign in order, its plan and results, then the
    researcher's notes about it (ledger/notes.jsonl, in the order written)."""
    for f in (DB, DB + '-wal', DB + '-shm'):
        if os.path.exists(f):
            os.remove(f)
    notes = [json.loads(l) for l in open(NOTES)] if os.path.exists(NOTES) else []
    for cid in sorted(d for d in os.listdir(os.path.join(ROOT, 'campaigns')) if glob.glob(os.path.join(ROOT, 'campaigns', d, 'runs*.jsonl'))):
        ingest(cid)
        mine = [n for n in notes if n.get('campaign') == cid]
        if mine:
            rt, G = open_ledger()
            for n in mine:
                emit(G, n['type'], {k: v for k, v in n.items() if k != 'type'})
            rt.run_until_idle()
        if upto and cid == upto:
            break


def export():
    rt, G = open_ledger()
    out = os.path.join(ROOT, 'ledger', 'events.jsonl')
    rt.export_trace(out)
    print('exported', len(G.events), 'events to', out)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd')
    a = sub.add_parser('ingest'); a.add_argument('campaign', nargs='+')
    a = sub.add_parser('finding'); a.add_argument('text'); a.add_argument('--evidence', nargs='*', default=[]); a.add_argument('--campaign')
    a = sub.add_parser('close'); a.add_argument('campaign'); a.add_argument('decision')
    sub.add_parser('export')
    a = sub.add_parser('rebuild'); a.add_argument('--upto')
    args = ap.parse_args()
    if args.cmd == 'ingest':
        opened = open_ledger()
        for c in args.campaign:
            ingest(c, opened)
    elif args.cmd == 'finding':
        finding(args.text, args.evidence, args.campaign)
    elif args.cmd == 'close':
        close(args.campaign, args.decision)
    elif args.cmd == 'export':
        export()
    elif args.cmd == 'rebuild':
        rebuild(args.upto)
    else:
        ap.print_help()
