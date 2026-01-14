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
import struct
import re
from pathlib import Path


def decode_bezier_path(path_obj):
    """
    Extract start and end points from NSBezierPath.

    Format appears to be segments of [type_byte][x:float32][y:float32]
    in big-endian order. Typical connection has 18 bytes:
    - Bytes 0: segment type
    - Bytes 1-4: x1 (float32 big-endian)
    - Bytes 5-8: y1 (float32 big-endian)
    - Byte 9: segment type
    - Bytes 10-13: x2 (float32 big-endian)
    - Bytes 14-17: y2 (float32 big-endian)
    """
    ns_segments = path_obj.get('NSSegments')
    if not ns_segments or not isinstance(ns_segments, bytes):
        return None, None

    data = ns_segments
    if len(data) < 9:
        return None, None

    try:
        # Parse first point (skip type byte, read big-endian float32 pair)
        x1 = struct.unpack('>f', data[1:5])[0]
        y1 = struct.unpack('>f', data[5:9])[0]
        start = (x1, y1)

        # Parse last point if we have enough data
        end = start  # Default to same point
        if len(data) >= 18:
            # Second segment starts at byte 9
            x2 = struct.unpack('>f', data[10:14])[0]
            y2 = struct.unpack('>f', data[14:18])[0]
            end = (x2, y2)

        return start, end
    except struct.error:
        return None, None


def build_element_index(etd_elements):
    """
    Build spatial index for element lookup by position.
    Returns list of {id, center, bounds} for each element.
    """
    index = []
    for elem in etd_elements:
        pos = elem['position']
        size = elem['size']
        # Use element center as reference point
        center = (
            pos['x'] + size['width'] / 2,
            pos['y'] + size['height'] / 2
        )
        index.append({
            'id': elem['id'],
            'center': center,
            'bounds': {
                'x': pos['x'],
                'y': pos['y'],
                'width': size['width'],
                'height': size['height']
            }
        })
    return index


def find_nearest_element(point, element_index, threshold=250):
    """
    Find element whose center is nearest to point within threshold.
    Returns element ID or None if no match within threshold.
    """
    if not point or point[0] == 0.0 and point[1] == 0.0:
        return None

    best_match = None
    best_dist = float('inf')

    for elem in element_index:
        cx, cy = elem['center']
        dist = ((point[0] - cx) ** 2 + (point[1] - cy) ** 2) ** 0.5

        # Check if point is within element bounds (edge connection)
        bounds = elem['bounds']
        in_bounds = (
            bounds['x'] <= point[0] <= bounds['x'] + bounds['width'] and
            bounds['y'] <= point[1] <= bounds['y'] + bounds['height']
        )

        if in_bounds:
            dist = 0  # Perfect match if inside bounds

        if dist < best_dist and dist <= threshold:
            best_dist = dist
            best_match = elem['id']

    return best_match


def parse_drawing(filepath):
    """Parse a DiagramMix .drawing file and extract elements and connections."""
    with open(filepath, 'rb') as f:
        data = plistlib.load(f)

    objects = data.get('$objects', [])

    # Store objects for connection extraction later
    parse_drawing.objects = objects

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


def parse_point_string(s):
    """Parse '{x, y}' string to tuple."""
    if isinstance(s, str) and s.startswith('{'):
        parts = s.strip('{}').split(',')
        if len(parts) == 2:
            return (float(parts[0].strip()), float(parts[1].strip()))
    return None


def extract_connections(objects, element_index):
    """
    Extract connections from DiaDecoratedSeparator objects.
    Uses proximity matching to find connected elements.
    """
    connections = []
    unmatched = 0

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

    for i, obj in enumerate(objects):
        cn = get_class_name(obj)
        if cn != 'DiaDecoratedSeparator':
            continue

        # Get container to find offset (path coordinates are relative to container)
        offset = (0, 0)
        container_ref = obj.get('container')
        if container_ref:
            container = resolve_uid(container_ref)
            if isinstance(container, dict):
                loc_ref = container.get('location')
                if loc_ref:
                    loc = resolve_uid(loc_ref)
                    loc_point = parse_point_string(loc)
                    if loc_point:
                        offset = loc_point

        # Get path to extract coordinates
        path_ref = obj.get('path')
        if not path_ref:
            continue

        path_obj = resolve_uid(path_ref)
        if not isinstance(path_obj, dict):
            continue

        start_point, end_point = decode_bezier_path(path_obj)

        # Apply container offset to convert to absolute coordinates
        if start_point:
            start_point = (start_point[0] + offset[0], start_point[1] + offset[1])
        if end_point:
            end_point = (end_point[0] + offset[0], end_point[1] + offset[1])

        # Find nearest elements to start and end points
        from_elem = find_nearest_element(start_point, element_index)
        to_elem = find_nearest_element(end_point, element_index)

        # Create connection if both ends matched and they're different elements
        if from_elem and to_elem and from_elem != to_elem:
            connections.append({
                'id': str(uuid.uuid4()),
                'from': from_elem,
                'to': to_elem,
                'type': 'support'
            })
        else:
            unmatched += 1

    if unmatched > 0:
        print(f"  Note: {unmatched} connections could not be matched to elements")

    # Remove duplicate connections (same from->to pair)
    seen = set()
    unique_connections = []
    for conn in connections:
        key = (conn['from'], conn['to'])
        if key not in seen:
            seen.add(key)
            unique_connections.append(conn)

    if len(connections) != len(unique_connections):
        print(f"  Note: Removed {len(connections) - len(unique_connections)} duplicate connections")

    return unique_connections


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

    # Extract connections using proximity matching
    if hasattr(parse_drawing, 'objects'):
        element_index = build_element_index(etd_elements)
        connections = extract_connections(parse_drawing.objects, element_index)

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
    print(f"\nElements: {len(etd_data['elements'])}")
    for elem in etd_data['elements']:
        text_preview = elem['content'][:50] + '...' if len(elem['content']) > 50 else elem['content']
        print(f"  [{elem['contributor']}] {elem['label']}: {text_preview}")

    print(f"\nConnections: {len(etd_data['connections'])}")
    # Build reverse index for element lookup
    elem_by_id = {e['id']: e for e in etd_data['elements']}
    for conn in etd_data['connections']:
        from_elem = elem_by_id.get(conn['from'], {})
        to_elem = elem_by_id.get(conn['to'], {})
        print(f"  {from_elem.get('label', '?')} -> {to_elem.get('label', '?')}")


if __name__ == '__main__':
    main()
