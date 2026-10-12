import { describe, expect, it } from 'vitest';
import {
  applySubtypeStyleMigration,
  createCurrentDefaults,
  createV1_2_MigrationDefaults,
  normalizeStyleConfig,
} from './styleConfigDefaults';
import { resolveSupportStyle } from './styleResolver';
import type { SupportElement } from '../types';

function other(subtype?: string): SupportElement {
  return {
    id: 's', type: 'support', contributor: 'teacher', supportType: 'other', subtype,
    content: '', position: { x: 0, y: 0 }, size: { width: 160, height: 60 },
  };
}

describe('Displays subtype default style', () => {
  it('new diagrams render Displays as a white ellipse', () => {
    const style = resolveSupportStyle(other('displays'), createCurrentDefaults());
    expect(style.borderShape).toBe('ellipse');
    expect(style.backgroundColor).toBe('#FFFFFF');
  });

  it('other Other subtypes keep the yellow rounded rectangle', () => {
    const cfg = createCurrentDefaults();
    for (const id of ['suggests', 'summarizes', 'restates', 'highlights', 'validates', undefined]) {
      const style = resolveSupportStyle(other(id), cfg);
      expect(style.borderShape).toBe('rounded');
      expect(style.backgroundColor).toBe('#FFFACD');
    }
  });

  it('migrates v1.2 frozen defaults without mutating the frozen factory', () => {
    const migrated = applySubtypeStyleMigration(createV1_2_MigrationDefaults());
    expect(resolveSupportStyle(other('displays'), migrated).borderShape).toBe('ellipse');
    expect(createV1_2_MigrationDefaults().subtypes.other[0].style).toBeUndefined();
  });

  it('migrates a v1.3-shaped (otherSubtypes) config after normalization', () => {
    const v13 = {
      argumentTypes: createCurrentDefaults().argumentTypes,
      supportTypes: createCurrentDefaults().supportTypes,
      otherSubtypes: [{ id: 'displays', label: 'Shows' }],
    };
    const migrated = applySubtypeStyleMigration(normalizeStyleConfig(v13));
    expect(migrated.subtypes.other[0]).toEqual({
      id: 'displays', label: 'Shows', style: { borderShape: 'ellipse', backgroundColor: '#FFFFFF' },
    });
  });

  it('is idempotent and respects a cleared override', () => {
    const cfg = createCurrentDefaults();
    expect(applySubtypeStyleMigration(cfg)).toBe(cfg);
    cfg.subtypes.other[0] = { id: 'displays', label: 'Displays', style: {} };
    expect(applySubtypeStyleMigration(cfg)).toBe(cfg);
    expect(resolveSupportStyle(other('displays'), cfg).borderShape).toBe('rounded');
  });

  it('student contributor still gets a dashed border on Displays', () => {
    const el = { ...other('displays'), contributor: 'student' as const };
    expect(resolveSupportStyle(el, createCurrentDefaults()).borderStyle).toBe('dashed');
  });
});
