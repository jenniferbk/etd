#!/usr/bin/env python3
"""
Convert DiagramMix .drawing files to ETD JSON format.

Usage:
    python convert-drawing.py input.drawing [output.json]

The output JSON can be imported directly into the ETD app.
"""

import plistlib
import json
import sys
import uuid
from pathlib import Path


def parse_drawing(filepath):
    """Parse a DiagramMix .drawing file and extract elements."""
    with open(filepath, 'rb') as f:
        data = plistlib.load(f)

    objects = data.get('$objects', [])

    def resolve_uid(uid_obj):
        if hasattr(uid_obj, 'data'):
            idx = uid_obj.data
            if 0 <= idx < len(objects):
                return objects[idx]
        return uid_obj

    def get_class_name(obj):
        if isinstance(obj, dict) and '$class' in obj:
            class_ref = obj['$class']
            if hasattr(class_ref, 'data'):
                class_obj = objects[class_ref.data]
                if isinstance(class_obj, dict):
                    return class_obj.get('$classname', 'Unknown')
        return None

    def parse_point(s):
        """Parse '{x, y}' string to dict"""
        if isinstance(s, str) and s.startswith('{'):
            parts = s.strip('{}').split(',')
            if len(parts) == 2:
                return {'x': float(parts[0].strip()), 'y': float(parts[1].strip())}
        return None

    def get_element_text(elem_obj):
        """Extract text from a DiaElement through the chain of references"""
        try:
            text_ref = elem_obj.get('text')
            if not text_ref or not hasattr(text_ref, 'data'):
                return None

            text_obj = objects[text_ref.data]
            if isinstance(text_obj, str):
                return None

            adorn_ref = text_obj.get('DKTextShape_textAdornment')
            if not adorn_ref or not hasattr(adorn_ref, 'data'):
                return None

            adorn = objects[adorn_ref.data]
            if isinstance(adorn, str):
                return None

            subst_ref = adorn.get('DKTextAdornment_substitutor')
            if not subst_ref or not hasattr(subst_ref, 'data'):
                return None

            subst = objects[subst_ref.data]
            if isinstance(subst, str):
                return None

            attr_ref = subst.get('DKOTextSubstitutor_attributedString')
            if not attr_ref or not hasattr(attr_ref, 'data'):
                return None

            attr_str = objects[attr_ref.data]
            if isinstance(attr_str, str):
                return None

            ns_str_ref = attr_str.get('NSString')
            if not ns_str_ref or not hasattr(ns_str_ref, 'data'):
                return None

            ns_str = objects[ns_str_ref.data]
            if isinstance(ns_str, str):
                return ns_str
            elif isinstance(ns_str, dict) and 'NS.string' in ns_str:
                return ns_str['NS.string']
        except (AttributeError, TypeError, KeyError):
            pass
        return None

    # Extract elements
    elements = []
    for i, obj in enumerate(objects):
        cn = get_class_name(obj)
        if cn == 'DiaElement':
            text = get_element_text(obj)
            color_scheme_id = obj.get('colorSchemeId', 0)

            # Get position
            position = None
            loc_ref = obj.get('location')
            if loc_ref:
                loc = resolve_uid(loc_ref)
                if isinstance(loc, str):
                    position = parse_point(loc)

            # Get size
            size = None
            size_ref = obj.get('size')
            if size_ref:
                s = resolve_uid(size_ref)
                if isinstance(s, str):
                    p = parse_point(s)
                    if p:
                        size = {'width': p['x'], 'height': p['y']}

            if position and size:
                elements.append({
                    'index': i,
                    'text': text,
                    'colorSchemeId': color_scheme_id,
                    'position': position,
                    'size': size,
                })

    return elements


def map_color_scheme_to_contributor(color_scheme_id):
    """Map DiagramMix colorSchemeId to ETD contributor type."""
    mapping = {
        1: 'given',      # Green - provided/given info
        10: 'student',   # Purple dashed - student contribution
        2: 'teacher',    # Red - teacher
        3: 'joint',      # Joint contribution
        4: 'implicit',   # Implicit/unstated
    }
    return mapping.get(color_scheme_id, 'student')


def infer_argument_type(text):
    """Infer argument type from text content."""
    if not text:
        return 'data'

    lower = text.lower()

    # Look for explicit labels
    if 'claim' in lower:
        return 'claim'
    if 'warrant' in lower:
        return 'warrant'
    if 'backing' in lower:
        return 'backing'
    if 'qualifier' in lower or 'probably' in lower or 'likely' in lower:
        return 'qualifier'
    if 'rebuttal' in lower or 'unless' in lower:
        return 'rebuttal'

    return 'data'


def convert_to_etd_format(elements):
    """Convert parsed elements to ETD diagram format."""
    etd_elements = []
    connections = []

    # Track labels by type for numbering
    label_counts = {
        'data': 0,
        'claim': 0,
        'warrant': 0,
        'backing': 0,
        'qualifier': 0,
        'rebuttal': 0,
    }

    for elem in elements:
        text = elem.get('text') or ''
        argument_type = infer_argument_type(text)
        contributor = map_color_scheme_to_contributor(elem.get('colorSchemeId', 0))

        label_counts[argument_type] += 1
        label = f"{argument_type.capitalize()} {label_counts[argument_type]}"

        # Parse attribution from text (timestamps like "(0:09:13.2)")
        attribution = None
        import re
        timestamp_match = re.match(r'^\((\d+:\d+(?::\d+)?(?:\.\d+)?)\)\s*', text)
        if timestamp_match:
            attribution = {
                'speaker': '',
                'timestamp': timestamp_match.group(1),
            }

        etd_element = {
            'id': str(uuid.uuid4()),
            'type': 'argument',
            'argumentType': argument_type,
            'contributor': contributor,
            'label': label,
            'position': elem['position'],
            'size': elem['size'],
            'content': text,
        }

        if attribution:
            etd_element['attribution'] = attribution

        etd_elements.append(etd_element)

    return {
        'version': '1.0',
        'name': 'Imported Diagram',
        'elements': etd_elements,
        'connections': connections,
        'legendPosition': {'x': 50, 'y': 50},
        'showLegend': True,
    }


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    input_path = Path(sys.argv[1])
    if not input_path.exists():
        print(f"Error: File not found: {input_path}")
        sys.exit(1)

    output_path = Path(sys.argv[2]) if len(sys.argv) > 2 else input_path.with_suffix('.json')

    print(f"Parsing: {input_path}")
    elements = parse_drawing(input_path)
    print(f"Found {len(elements)} elements")

    etd_data = convert_to_etd_format(elements)

    with open(output_path, 'w') as f:
        json.dump(etd_data, f, indent=2)

    print(f"Saved to: {output_path}")
    print("\nElements:")
    for elem in etd_data['elements']:
        text_preview = elem['content'][:50] + '...' if len(elem['content']) > 50 else elem['content']
        print(f"  [{elem['contributor']}] {elem['label']}: {text_preview}")


if __name__ == '__main__':
    main()
