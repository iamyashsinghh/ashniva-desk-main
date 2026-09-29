import { ROLE_KEYS, type ProjectDetail } from '@ashniva/types';

import { sessionUser } from '../../shared/testing/harness';
import {
  initialProjectForm,
  projectPayload,
  sanitizeProjectCode,
  validateProjectForm,
  type ProjectFormState,
} from './project-form';

/**
 * The project form's rules, without a screen.
 *
 * What is worth pinning: the code is only ever sent on create (the API has no field for changing
 * it), a cleared description is sent as null on an edit so it is actually cleared, and the checks
 * the web makes before sending are the same ones made here.
 */

function valid(over: Partial<ProjectFormState> = {}): ProjectFormState {
  return {
    ...initialProjectForm(null, null),
    code: 'ACM',
    name: 'Acme portal',
    leadUserId: 'lead-1',
    teamId: 'team-1',
    ...over,
  };
}

describe('sanitizeProjectCode', () => {
  it('upper-cases, strips anything but letters and digits, and stops at eight', () => {
    expect(sanitizeProjectCode('ac-m 12345678')).toBe('ACM12345');
  });
});

describe('validateProjectForm', () => {
  it('passes a complete form', () => {
    expect(validateProjectForm(valid(), false)).toEqual({});
  });

  it('asks for a code, a name, a lead and a team', () => {
    const errors = validateProjectForm(
      valid({ code: '1A', name: ' x ', leadUserId: null, teamId: null }),
      false,
    );
    expect(Object.keys(errors).sort()).toEqual(['code', 'leadUserId', 'name', 'teamId']);
  });

  it('does not judge the code of a project that already exists', () => {
    expect(validateProjectForm(valid({ code: '' }), true)).toEqual({});
  });

  it('refuses a delivery date before the start', () => {
    const errors = validateProjectForm(
      valid({ startDate: '2026-10-10', targetDate: '2026-10-01' }),
      false,
    );
    expect(errors.targetDate).toBeTruthy();
  });
});

describe('projectPayload', () => {
  it('sends the code on create and leaves an empty description out', () => {
    const body = projectPayload(valid({ code: 'acm', name: '  Acme portal ' }), false);
    expect(body.code).toBe('ACM');
    expect(body.name).toBe('Acme portal');
    expect('description' in body).toBe(false);
  });

  it('never sends the code on edit, and clears a removed description with null', () => {
    const body = projectPayload(valid({ description: '   ' }), true);
    expect('code' in body).toBe(false);
    expect(body.description).toBeNull();
  });
});

describe('initialProjectForm', () => {
  it('puts a project manager in the manager seat of a new project', () => {
    const me = sessionUser({ roleKey: ROLE_KEYS.PROJECT_MANAGER });
    expect(initialProjectForm(null, me).managerUserId).toBe(me.id);
    expect(initialProjectForm(null, me).leadUserId).toBeNull();
  });

  it('starts an edit from what is saved', () => {
    const project = {
      code: 'ACM',
      name: 'Acme',
      description: null,
      type: 'AMC',
      status: 'ON_HOLD',
      clientOrganization: { id: 'org-1', name: 'Acme Ltd' },
      manager: null,
      lead: { id: 'lead-1', name: 'Lee', email: 'lee@example.com' },
      team: { id: 'team-1', name: 'Web' },
      startDate: '2026-09-01',
      targetDate: null,
      requiresClientUat: true,
    } as unknown as ProjectDetail;
    expect(initialProjectForm(project, null)).toMatchObject({
      type: 'AMC',
      status: 'ON_HOLD',
      clientOrganizationId: 'org-1',
      leadUserId: 'lead-1',
      teamId: 'team-1',
      requiresClientUat: true,
      description: '',
    });
  });
});
