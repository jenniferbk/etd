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


def build_element_index(etd_elements, exclude_info_boxes=True):
    """
    Build spatial index for element lookup by position.
    Returns list of {id, center, bounds} for each element.

    exclude_info_boxes: if True, excludes infoBox elements from the index
                        (info boxes shouldn't be part of argument connections)
    """
    index = []
    for elem in etd_elements:
        # Skip info boxes for connection matching
        if exclude_info_boxes and elem.get('type') == 'infoBox':
            continue

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


def find_nearest_element_in_direction(point, element_index, direction, threshold=500, alignment_threshold=30):
    """
    Find element in a specific direction from point.
    Direction: 'left', 'right', 'up', 'down'
    Only considers elements in the specified direction from the point,
    AND roughly aligned perpendicular to that direction.
    """
    if not point:
        return None

    best_match = None
    best_dist = float('inf')

    for elem in element_index:
        cx, cy = elem['center']
        bounds = elem['bounds']
        elem_top = bounds['y']
        elem_bottom = bounds['y'] + bounds['height']
        elem_left = bounds['x']
        elem_right = bounds['x'] + bounds['width']

        # Check if element is in the correct direction AND aligned
        if direction == 'left':
            # Element should be to the left of point
            if elem_right > point[0]:
                continue  # Element is not to the left
            # Also check vertical alignment - point.y should overlap with element's y range
            if point[1] < elem_top - alignment_threshold or point[1] > elem_bottom + alignment_threshold:
                continue  # Element is not vertically aligned
            dist = point[0] - elem_right  # Horizontal distance to right edge
        elif direction == 'right':
            # Element should be to the right of point
            if elem_left < point[0]:
                continue  # Element is not to the right
            # Also check vertical alignment
            if point[1] < elem_top - alignment_threshold or point[1] > elem_bottom + alignment_threshold:
                continue  # Element is not vertically aligned
            dist = elem_left - point[0]  # Horizontal distance to left edge
        elif direction == 'up':
            # Element should be above the point
            if elem_bottom > point[1]:
                continue  # Element is not above
            # Also check horizontal alignment
            if point[0] < elem_left - alignment_threshold or point[0] > elem_right + alignment_threshold:
                continue  # Element is not horizontally aligned
            dist = point[1] - elem_bottom  # Vertical distance to bottom edge
        elif direction == 'down':
            # Element should be below the point
            if elem_top < point[1]:
                continue  # Element is not below
            # Also check horizontal alignment
            if point[0] < elem_left - alignment_threshold or point[0] > elem_right + alignment_threshold:
                continue  # Element is not horizontally aligned
            dist = elem_top - point[1]  # Vertical distance to top edge
        else:
            continue

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

    def is_tee_connector(elem_obj):
        """Check if a DiaElement is a tee connector (group with multiple separator segments)."""
        grouped_ref = elem_obj.get('groupedobjects')
        if not grouped_ref or not hasattr(grouped_ref, 'data'):
            return False

        grouped = resolve_uid(grouped_ref)
        if not isinstance(grouped, dict) or 'NS.objects' not in grouped:
            return False

        # Count DiaDecoratedSeparator children
        separator_count = 0
        for uid in grouped['NS.objects']:
            child_idx = uid.data
            child = objects[child_idx]
            child_cn = get_class_name(child)
            if child_cn == 'DiaDecoratedSeparator':
                separator_count += 1

        # It's a tee connector if it has 2+ separator segments
        return separator_count >= 2

    # Extract elements
    elements = []
    for i, obj in enumerate(objects):
        cn = get_class_name(obj)
        if cn == 'DiaElement':
            # Skip tee connectors - they're connections, not elements
            if is_tee_connector(obj):
                continue

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

    # Also extract DiaText objects (standalone text boxes like Info elements)
    for i, obj in enumerate(objects):
        cn = get_class_name(obj)
        if cn == 'DiaText':
            text = get_element_text(obj)

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

            # DiaText doesn't have colorSchemeId - use 0 (maps to 'student')
            if position and size:
                elements.append({
                    'index': i,
                    'text': text,
                    'colorSchemeId': 0,  # Default - will be styled as info box
                    'position': position,
                    'size': size,
                    'isInfoBox': True,  # Mark as info box for special handling
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


def extract_tee_connectors(objects):
    """
    Find DiaElement groups that contain multiple DiaDecoratedSeparator children.
    These represent tee/branching connectors in Toulmin diagrams.

    A tee connector has:
    - Main segment (usually horizontal): connects source element to target element
    - Perpendicular segment(s): warrant attachments to the main connection

    Returns list of tee connector info with classified segments.
    """
    tee_connectors = []

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
        if cn != 'DiaElement':
            continue

        # Check if this element has grouped objects
        grouped_ref = obj.get('groupedobjects')
        if not grouped_ref or not hasattr(grouped_ref, 'data'):
            continue

        grouped = resolve_uid(grouped_ref)
        if not isinstance(grouped, dict) or 'NS.objects' not in grouped:
            continue

        # Check if grouped objects are DiaDecoratedSeparator (connector segments)
        separator_indices = []
        for uid in grouped['NS.objects']:
            child_idx = uid.data
            child = objects[child_idx]
            child_cn = get_class_name(child)
            if child_cn == 'DiaDecoratedSeparator':
                separator_indices.append(child_idx)

        # Only process as tee connector if there are 2+ separator segments
        if len(separator_indices) < 2:
            continue

        # Get the group's location (used as offset for relative coordinates)
        offset = (0, 0)
        loc_ref = obj.get('location')
        if loc_ref:
            loc_str = resolve_uid(loc_ref)
            loc_point = parse_point_string(loc_str)
            if loc_point:
                offset = loc_point

        # Extract bezier path endpoints from each separator segment
        segments = []
        for sep_idx in separator_indices:
            sep_obj = objects[sep_idx]
            path_ref = sep_obj.get('path')
            if not path_ref:
                continue

            path_obj = resolve_uid(path_ref)
            if not isinstance(path_obj, dict):
                continue

            start_point, end_point = decode_bezier_path(path_obj)

            # Convert to absolute coordinates
            if start_point:
                start_point = (start_point[0] + offset[0], start_point[1] + offset[1])
            if end_point:
                end_point = (end_point[0] + offset[0], end_point[1] + offset[1])

            if start_point and end_point:
                # Classify segment as horizontal or vertical
                dx = abs(end_point[0] - start_point[0])
                dy = abs(end_point[1] - start_point[1])
                is_horizontal = dx > dy

                segments.append({
                    'start': start_point,
                    'end': end_point,
                    'is_horizontal': is_horizontal
                })

        if segments:
            # Classify segments: horizontal = main connection, vertical = warrant attachment
            main_segment = None
            attachment_segments = []

            for seg in segments:
                if seg['is_horizontal']:
                    main_segment = seg
                else:
                    attachment_segments.append(seg)

            # If no clear horizontal, use the longer segment as main
            if main_segment is None and segments:
                segments_by_length = sorted(segments,
                    key=lambda s: ((s['end'][0]-s['start'][0])**2 + (s['end'][1]-s['start'][1])**2),
                    reverse=True)
                main_segment = segments_by_length[0]
                attachment_segments = segments_by_length[1:]

            tee_connectors.append({
                'index': i,
                'separator_indices': separator_indices,
                'main_segment': main_segment,
                'attachment_segments': attachment_segments,
                'location': offset
            })
            print(f"  Found tee connector at index {i}: main + {len(attachment_segments)} attachment(s)")

    return tee_connectors


def extract_connections(objects, element_index, tee_connectors=None):
    """
    Extract connections from DiaDecoratedSeparator objects and tee connectors.
    Uses proximity matching to find connected elements.

    tee_connectors: list of tee connector info dicts with 'segments' containing
                    absolute endpoint coordinates for each line segment
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

    # Track which DiaDecoratedSeparators are part of tee connectors (to skip them)
    tee_separator_indices = set()
    if tee_connectors:
        for tee in tee_connectors:
            tee_separator_indices.update(tee.get('separator_indices', []))

    # Process regular (non-tee) DiaDecoratedSeparator connections
    for i, obj in enumerate(objects):
        cn = get_class_name(obj)
        if cn != 'DiaDecoratedSeparator':
            continue

        # Skip separators that are part of tee connectors
        if i in tee_separator_indices:
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

    # Process tee connectors - create main connection and warrant attachments
    # Returns: (connections list, warrant_element_ids set)
    warrant_element_ids = set()

    if tee_connectors:
        for tee in tee_connectors:
            main_seg = tee.get('main_segment')
            attachment_segs = tee.get('attachment_segments', [])

            if not main_seg:
                continue

            # Find source and target for main segment (horizontal connection)
            left_pt = main_seg['start'] if main_seg['start'][0] < main_seg['end'][0] else main_seg['end']
            right_pt = main_seg['end'] if main_seg['start'][0] < main_seg['end'][0] else main_seg['start']

            source_elem = find_nearest_element_in_direction(left_pt, element_index, 'left')
            target_elem = find_nearest_element_in_direction(right_pt, element_index, 'right')

            if source_elem and target_elem:
                # Create main connection
                main_conn_id = str(uuid.uuid4())
                connections.append({
                    'id': main_conn_id,
                    'from': source_elem,
                    'to': target_elem,
                    'type': 'support'
                })

                # Process attachment segments (warrants)
                for att_seg in attachment_segs:
                    # Find element at the far end of the attachment (away from junction)
                    # Junction is roughly where segments meet (middle of main segment)
                    main_mid_y = (main_seg['start'][1] + main_seg['end'][1]) / 2

                    # For vertical attachments, find element above or below
                    top_pt = att_seg['start'] if att_seg['start'][1] < att_seg['end'][1] else att_seg['end']
                    bottom_pt = att_seg['end'] if att_seg['start'][1] < att_seg['end'][1] else att_seg['start']

                    # The warrant element is at the far end from the junction
                    # If junction is near top of segment, warrant is at bottom (and vice versa)
                    if abs(top_pt[1] - main_mid_y) < abs(bottom_pt[1] - main_mid_y):
                        # Junction is near top, warrant is at bottom
                        warrant_elem = find_nearest_element_in_direction(bottom_pt, element_index, 'down')
                    else:
                        # Junction is near bottom, warrant is at top
                        warrant_elem = find_nearest_element_in_direction(top_pt, element_index, 'up')

                    if warrant_elem:
                        warrant_element_ids.add(warrant_elem)

                        # Calculate position along main connection (0-1)
                        # Based on where the attachment joins the main segment
                        att_junction_x = (att_seg['start'][0] + att_seg['end'][0]) / 2
                        main_start_x = min(main_seg['start'][0], main_seg['end'][0])
                        main_end_x = max(main_seg['start'][0], main_seg['end'][0])
                        main_length = main_end_x - main_start_x

                        if main_length > 0:
                            position = (att_junction_x - main_start_x) / main_length
                            position = max(0.1, min(0.9, position))  # Clamp to reasonable range
                        else:
                            position = 0.5

                        # Create warrant attachment connection
                        connections.append({
                            'id': str(uuid.uuid4()),
                            'from': warrant_elem,
                            'to': {
                                'connectionId': main_conn_id,
                                'position': position
                            },
                            'type': 'support'
                        })

    # Store warrant IDs for element type conversion
    extract_connections.warrant_element_ids = warrant_element_ids

    if unmatched > 0:
        print(f"  Note: {unmatched} connections could not be matched to elements")

    # Remove duplicate connections (same from->to pair)
    seen = set()
    unique_connections = []
    for conn in connections:
        # Handle ConnectionTarget (dict) vs element ID (string) for to field
        to_val = conn['to']
        if isinstance(to_val, dict):
            # For ConnectionTarget, create hashable key from connectionId and position
            to_key = (to_val['connectionId'], to_val['position'])
        else:
            to_key = to_val

        key = (conn['from'], to_key)
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

    # Phase 1: Create elements with initial types (will be corrected after connection analysis)
    for elem in elements:
        text = elem.get('text') or ''

        # Handle info boxes (DiaText objects) differently
        if elem.get('isInfoBox'):
            etd_element = {
                'id': str(uuid.uuid4()),
                'type': 'infoBox',
                'label': '',  # Will be set later
                'position': elem['position'],
                'size': elem['size'],
                'content': text,
            }
            etd_elements.append(etd_element)
            continue

        # Regular argument elements - initially typed as data
        # Warrant type will be corrected after connection analysis
        argument_type = infer_argument_type(text)
        contributor = map_color_scheme_to_contributor(elem.get('colorSchemeId', 0))

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
            'label': '',  # Will be set later
            'position': elem['position'],
            'size': elem['size'],
            'content': text,
        }

        if attribution:
            etd_element['attribution'] = attribution

        etd_elements.append(etd_element)

    # Phase 2: Extract connections and identify warrant elements
    if hasattr(parse_drawing, 'objects'):
        # Find tee connectors (DiaElement groups with multiple separator segments)
        tee_connectors = extract_tee_connectors(parse_drawing.objects)

        element_index = build_element_index(etd_elements)
        connections = extract_connections(parse_drawing.objects, element_index, tee_connectors)

        # Get warrant element IDs identified during connection extraction
        warrant_element_ids = getattr(extract_connections, 'warrant_element_ids', set())

        # Phase 3: Update warrant elements to have correct argumentType
        for elem in etd_elements:
            if elem['id'] in warrant_element_ids and elem['type'] == 'argument':
                elem['argumentType'] = 'warrant'
                print(f"  Converted element to warrant: {elem['content'][:40]}...")

    # Phase 4: Assign labels based on final types
    label_counts = {
        'data': 0,
        'claim': 0,
        'warrant': 0,
        'backing': 0,
        'qualifier': 0,
        'rebuttal': 0,
        'infoBox': 0,
    }

    for elem in etd_elements:
        if elem['type'] == 'infoBox':
            label_counts['infoBox'] += 1
            elem['label'] = f"Info {label_counts['infoBox']}"
        elif elem['type'] == 'argument':
            arg_type = elem['argumentType']
            label_counts[arg_type] += 1
            elem['label'] = f"{arg_type.capitalize()} {label_counts[arg_type]}"

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
        if elem['type'] == 'infoBox':
            print(f"  [info] {elem['label']}: {text_preview}")
        else:
            print(f"  [{elem['contributor']}] {elem['label']}: {text_preview}")

    print(f"\nConnections: {len(etd_data['connections'])}")
    # Build reverse index for element lookup
    elem_by_id = {e['id']: e for e in etd_data['elements']}
    conn_by_id = {c['id']: c for c in etd_data['connections']}
    for conn in etd_data['connections']:
        from_elem = elem_by_id.get(conn['from'], {})
        to_val = conn['to']
        if isinstance(to_val, dict):
            # ConnectionTarget - attachment to another connection
            target_conn = conn_by_id.get(to_val['connectionId'], {})
            target_from = elem_by_id.get(target_conn.get('from', ''), {})
            target_to = target_conn.get('to', '')
            if isinstance(target_to, str):
                target_to_elem = elem_by_id.get(target_to, {})
                target_label = f"{target_from.get('label', '?')}->{target_to_elem.get('label', '?')}"
            else:
                target_label = f"{target_from.get('label', '?')}->..."
            print(f"  {from_elem.get('label', '?')} --[attaches to]--> ({target_label}) @ {to_val['position']:.1%}")
        else:
            to_elem = elem_by_id.get(to_val, {})
            print(f"  {from_elem.get('label', '?')} -> {to_elem.get('label', '?')}")


if __name__ == '__main__':
    main()
