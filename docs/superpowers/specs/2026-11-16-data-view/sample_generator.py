import json, sys, re, openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.formatting.rule import Rule
from openpyxl.styles.differential import DifferentialStyle
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.utils import get_column_letter as L

out, old, files = sys.argv[1], sys.argv[2], sys.argv[3:]

# ---- codebook seeded from the old VLOOKUP tab
ow = openpyxl.load_workbook(old)['VLOOKUP']
codebook = [(r[0], r[1], 'Question' if str(r[1]).startswith('Requesting') else 'Other')
            for r in ow.iter_rows(min_row=2, values_only=True) if r[0]]
kind_by_id = {k.lower(): k for k, _, _ in codebook}

def secs(t):
    if not t: return None
    p = [int(x) for x in re.findall(r'\d+', t.split('-')[0])]
    return sum(v * 60 ** i for i, v in enumerate(reversed(p))) if p else None

def tstr(e):
    a = e.get('attribution') or {}
    return (a.get('timestamp') or '').strip()

def spk(e):
    a = e.get('attribution') or {}
    return re.sub(r'^Student-', '', (a.get('speaker') or '').strip())

PART = dict(data='D', claim='C', warrant='W', backing='B', qualifier='Q', rebuttal='R')
INF = 10 ** 9
rows = []
for f in files:
    d = json.load(open(f))
    els = {e['id']: e for e in d['elements']}
    conns = {c['id']: c for c in d['connections']}
    info = next((e for e in d['elements'] if e['type'] == 'infoBox'), None)
    episode = re.sub(r'[ ._]*(not vetted|ifinal.*|vetted)$', '', d['name'], flags=re.I).strip(' ._')
    clip = (re.search(r'\[([^\]]+)\]', info['content']).group(1) if info and '[' in info['content'] else '')
    status = ''  # entered by the team; never inferred from file names
    args = [e for e in d['elements'] if e['type'] == 'argument']
    # fold qualifiers into the component their arrow points to
    fold = {}
    for q in args:
        if q['argumentType'] == 'qualifier' and q.get('attachedTo'):
            c = conns.get(q['attachedTo']['connectionId'])
            if c and isinstance(c['to'], str): fold[q['id']] = c['to']
    comps = [e for e in args if e['id'] not in fold]
    label = lambda e: (e.get('label') or PART[e['argumentType']]).strip()
    groups = {c['id']: dict(el=c, Q=[], O=[], A=[], qual=[], links=[], notes=[]) for c in comps}
    for q, tgt in fold.items():
        if tgt in groups: groups[tgt]['qual'].append(els[q]['content'].strip())
    for c in d['connections']:
        g = groups.get(c['from'])
        if not g: continue
        if isinstance(c['to'], str) and c['to'] in els:
            g['links'].append('→ ' + label(els[c['to']]))
        elif isinstance(c['to'], dict) and c['to'].get('connectionId') in conns:
            base = conns[c['to']['connectionId']]
            if isinstance(base['to'], str) and base['from'] in els and base['to'] in els:
                g['links'].append(f"→ link {label(els[base['from']])}→{label(els[base['to']])}")
    for n in d.get('notes', []):
        a = n.get('anchor') or {}
        if a.get('kind') == 'element' and fold.get(a.get('id'), a.get('id')) in groups:
            groups[fold.get(a['id'], a['id'])]['notes'].append(n['text'])
    unlinked = dict(el=None, Q=[], O=[], A=[], qual=[], links=[], notes=[])
    for m in d['elements']:
        if m['type'] != 'support': continue
        tgt = fold.get(m.get('associatedWith'), m.get('associatedWith'))
        g = groups.get(tgt, unlinked)
        slot = {'question': 'Q', 'other': 'O'}.get(m['supportType'], 'A')
        g[slot].append(m)
    def ckey(g):
        e = g['el']
        return (0 if e['contributor'] == 'given' else 1, secs(tstr(e)) or (0 if e['contributor'] == 'given' else INF), e['position']['y'])
    ordered = sorted(groups.values(), key=ckey)
    if any(unlinked[k] for k in 'QOA'): ordered.append(unlinked)
    for g in ordered:
        for k in 'QOA': g[k].sort(key=lambda m: secs(tstr(m)) or INF)
        n = max(1, *(len(g[k]) for k in 'QOA'))
        e = g['el']
        for i in range(n):
            pick = lambda k: g[k][i] if i < len(g[k]) else None
            rows.append(dict(
                ep=episode, clip=clip, status=status, did=d['name'],
                part=PART[e['argumentType']] if e else '—', contrib=e['contributor'] if e else '',
                content=e['content'].strip() if e else '(not linked to a component)',
                who=spk(e) if e else '', time=tstr(e) if e else '',
                qual='; '.join(g['qual']), links='; '.join(g['links']), note=' | '.join(g['notes']),
                cid=e['id'] if e else f"unlinked:{d['name']}",
                Q=pick('Q'), O=pick('O'), A=pick('A'), first=1 if i == 0 else 0))

# ---- write workbook
wb = openpyxl.Workbook(); ws = wb.active; ws.title = 'Data'
cols = [  # (group, header, width, key)
 ('', '#', 5, 'seq'),
 ('Episode', 'Episode', 22, 'ep'), ('Episode', 'Clip', 12, 'clip'), ('Episode', 'Status', 11, 'status'),
 ('Episode', 'SG/WC', 8, 'sgwc'), ('Episode', 'Discipline', 11, 'disc'),
 ('Component', 'Part', 6, 'part'), ('Component', 'Contributor', 11, 'contrib'),
 ('Component', 'Content of component', 40, 'content'), ('Component', 'Who', 12, 'who'), ('Component', 'Time', 8, 'time'),
 ('Component', 'Qualifier', 16, 'qual'),
 ('First pass (untyped)', 'Move', 34, 'A_txt'), ('First pass (untyped)', 'By', 12, 'A_by'), ('First pass (untyped)', 'Type', 10, 'A_type'),
 ('First pass (untyped)', 'Kind', 16, 'A_kind'), ('First pass (untyped)', 'Category', 18, 'A_cat'),
 ('Question', 'Question', 34, 'Q_txt'), ('Question', 'By', 12, 'Q_by'), ('Question', 'Kind', 16, 'Q_kind'), ('Question', 'Category', 18, 'Q_cat'),
 ('Other', 'Other', 34, 'O_txt'), ('Other', 'By', 12, 'O_by'), ('Other', 'Kind', 16, 'O_kind'), ('Other', 'Category', 18, 'O_cat'),
 ('', 'Links to', 18, 'links'), ('', 'Note', 24, 'note'),
 ('IDs (hidden)', 'component_id', 10, 'cid'), ('IDs (hidden)', 'move_id_untyped', 10, 'A_id'),
 ('IDs (hidden)', 'move_id_question', 10, 'Q_id'), ('IDs (hidden)', 'move_id_other', 10, 'O_id'),
 ('IDs (hidden)', 'diagram', 10, 'did'), ('IDs (hidden)', 'first_row_of_component', 10, 'first')]
ci = {c[3]: i + 1 for i, c in enumerate(cols)}
colL = {k: L(v) for k, v in ci.items()}
GROUPFILL = {'Episode': 'D9D9D9', 'Component': 'FCE4D6', 'First pass (untyped)': 'EDEDED', 'Question': 'DDEBF7',
             'Other': 'FFF2CC', 'IDs (hidden)': 'F2F2F2', '': 'FFFFFF'}
prev = None
for j, (grp, hdr, w, k) in enumerate(cols, 1):
    fill = PatternFill('solid', fgColor=GROUPFILL[grp])
    c1 = ws.cell(1, j, grp if grp != prev else None); c1.fill = fill; c1.font = Font(bold=True, size=11)
    c2 = ws.cell(2, j, hdr); c2.fill = fill; c2.font = Font(bold=True); c2.alignment = Alignment(wrap_text=True, vertical='bottom')
    ws.column_dimensions[L(j)].width = w
    prev = grp

def mtxt(m):
    if not m: return None
    t = m['content'].strip(); ts = tstr(m)
    return t + (f" ({ts})" if ts else '')
def mby(m):
    return (spk(m) or m['contributor']) if m else None
def mkind(m):
    return kind_by_id.get((m.get('subtype') or '').lower()) if m else None
def mtype(m):
    return {'question': 'Question', 'other': 'Other'}.get(m['supportType']) if m else None

wrap = Alignment(wrap_text=True, vertical='top')
repeat_cols_early = ['ep', 'clip', 'status', 'sgwc', 'disc', 'part', 'contrib', 'content', 'who', 'time', 'qual', 'links', 'note']
for r, row in enumerate(rows, 3):
    vals = dict(row, seq=r - 2,
                A_txt=mtxt(row['A']), Q_txt=mtxt(row['Q']), O_txt=mtxt(row['O']),
                A_by=mby(row['A']), Q_by=mby(row['Q']), O_by=mby(row['O']),
                A_kind=mkind(row['A']), Q_kind=mkind(row['Q']), O_kind=mkind(row['O']),
                A_id=row['A'] and row['A']['id'], Q_id=row['Q'] and row['Q']['id'],
                O_id=row['O'] and row['O']['id'])
    for g in 'AQO':
        vals[f'{g}_cat'] = f'=IF({colL[g+"_kind"]}{r}="","",IFERROR(VLOOKUP({colL[g+"_kind"]}{r},CodebookTable,2,FALSE),"? not in codebook"))'
    for k, j in ci.items():
        v = vals.get(k)
        if v is not None and v != '':
            ws.cell(r, j, v)
        ws.cell(r, j).alignment = wrap
    if not row['first']:  # continuation rows stay one line high: repeated component cells don't wrap
        for k in repeat_cols_early:
            ws.cell(r, ci[k]).alignment = Alignment(wrap_text=False, vertical='top')
last = len(rows) + 2

# hide ID columns
for k in ['cid', 'A_id', 'Q_id', 'O_id', 'did', 'first']:
    ws.column_dimensions[colL[k]].hidden = True
ws.freeze_panes = 'C3'
ws.auto_filter.ref = f"A2:{L(len(cols))}{last}"

# conditional formatting: gray repeats + group/episode borders
C, E = colL['cid'], colL['did']
repeat_cols = ['ep', 'clip', 'status', 'sgwc', 'disc', 'part', 'contrib', 'content', 'who', 'time', 'qual', 'links', 'note']
gray = DifferentialStyle(font=Font(color='BFBFBF'))
for k in repeat_cols:
    rng = f"{colL[k]}4:{colL[k]}{last}"
    ws.conditional_formatting.add(rng, Rule(type='expression', dxf=gray, formula=[f'${C}4=${C}3']))
full = f"A3:{L(len(cols))}{last}"
ws.conditional_formatting.add(full, Rule(type='expression', stopIfTrue=True,
    dxf=DifferentialStyle(border=Border(top=Side(style='thin', color='000000'))), formula=[f'${E}3<>${E}2']))
ws.conditional_formatting.add(full, Rule(type='expression',
    dxf=DifferentialStyle(border=Border(top=Side(style='thin', color='A6A6A6'))), formula=[f'${C}3<>${C}2']))

# ---- codebook tab + named ranges
cb = wb.create_sheet('Codebook')
cb.append(['Kind', 'Category', 'Type', 'Status']); [setattr(c, 'font', Font(bold=True)) for c in cb[1]]
qk = [x for x in codebook if x[2] == 'Question']; ok = [x for x in codebook if x[2] == 'Other']
for k, cat, t in qk + ok: cb.append([k, cat, t, 'active'])
for c, w in zip('ABCD', (22, 28, 10, 10)): cb.column_dimensions[c].width = w
n = len(codebook) + 1
wb.defined_names['CodebookTable'] = DefinedName('CodebookTable', attr_text=f"Codebook!$A$2:$C${n}")
wb.defined_names['QuestionKinds'] = DefinedName('QuestionKinds', attr_text=f"Codebook!$A$2:$A${len(qk)+1}")
wb.defined_names['OtherKinds'] = DefinedName('OtherKinds', attr_text=f"Codebook!$A${len(qk)+2}:$A${n}")
cb.append([]); cb.append(['Seeded from the VLOOKUP tab of Teacher Support Analysis Combined.xlsx. The live codebook will be editable in ETD.'])

# dropdowns
def dv(formula, keys):
    v = DataValidation(type='list', formula1=formula, allow_blank=True, showErrorMessage=True)
    ws.add_data_validation(v)
    for k in keys: v.add(f"{colL[k]}3:{colL[k]}{last}")
dv('"Question,Other"', ['A_type'])
dv('=QuestionKinds', ['Q_kind']); dv('=OtherKinds', ['O_kind'])
dv('"SG,WC"', ['sgwc']); dv('"vetted,not vetted"', ['status'])
for g in 'A':
    v = DataValidation(type='list', formula1=f'=INDIRECT({colL[g+"_type"]}3&"Kinds")', allow_blank=True)
    ws.add_data_validation(v); v.add(f"{colL[g+'_kind']}3:{colL[g+'_kind']}{last}")

wb.save(out)
print(len(rows), 'rows;', sum(r['first'] for r in rows), 'component groups;',
      sum(1 for r in rows for g in 'AQO' if r[g]), 'moves')
