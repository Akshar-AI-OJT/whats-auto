import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  resolveIsResolvingAccess,
  resolveTenantOrganizationId,
  sessionConfirmsActiveOrg,
} from './organization-access-gate.ts'
import { isApiResultShape, unwrapEntityData } from './unwrap-api-entity.ts'

describe('unwrapEntityData / platform settings regression', () => {
  const isSettings = (value: Record<string, unknown>) =>
    typeof value.platformName === 'string' && typeof value.supportEmail === 'string'

  it('unwraps Adonis { data: settings } body', () => {
    const body = {
      data: { platformName: 'WhatsAuto', supportEmail: 'a@b.c' },
    }
    const settings = unwrapEntityData(body, isSettings)
    assert.equal(settings?.platformName, 'WhatsAuto')
  })

  it('does not treat full ApiResult as settings (the 200 + not-found bug)', () => {
    const apiResult = {
      data: { data: { platformName: 'WhatsAuto', supportEmail: 'a@b.c' } },
      response: {},
    }
    assert.equal(isApiResultShape(apiResult), true)
    // Passing ApiResult accidentally: candidate becomes the inner envelope, fields missing
    const mistaken = unwrapEntityData(apiResult, isSettings)
    assert.equal(mistaken, null)
    // Correct: pass .data (wire body)
    const settings = unwrapEntityData(apiResult.data, isSettings)
    assert.equal(settings?.supportEmail, 'a@b.c')
  })
})

describe('organization access gate regression', () => {
  it('confirms active org via activatedOrganizationId when session hook is stale', () => {
    assert.equal(
      sessionConfirmsActiveOrg({
        activeOrgId: 'org-1',
        accessContextOrgId: null,
        sessionOrgId: null,
        activatedOrganizationId: 'org-1',
      }),
      true
    )
  })

  it('exposes tenantOrganizationId after set-active even if useSession lacks activeOrganizationId', () => {
    const tenantId = resolveTenantOrganizationId({
      activeOrgId: 'org-1',
      tokenReadyOrgId: 'org-1',
      accessContextOrgId: null,
      sessionOrgId: null,
      activatedOrganizationId: 'org-1',
    })
    assert.equal(tenantId, 'org-1')
  })

  it('keeps isResolvingAccess true while access-context is loading (empty permissions flash)', () => {
    const tenantId = resolveTenantOrganizationId({
      activeOrgId: 'org-1',
      tokenReadyOrgId: 'org-1',
      accessContextOrgId: null,
      sessionOrgId: 'org-1',
      activatedOrganizationId: null,
    })
    assert.equal(tenantId, 'org-1')

    const resolving = resolveIsResolvingAccess(
      {
        activeOrgId: 'org-1',
        accessContextOrgId: null,
        sessionOrgId: 'org-1',
        activatedOrganizationId: null,
        tokenReadyOrgId: 'org-1',
        pendingActiveId: null,
        accessQueryLoading: true,
        sessionPending: false,
        orgsLoading: false,
        bootstrapping: false,
        isSignedIn: true,
        accessQueryFetched: false,
        hasAccessContext: false,
      },
      tenantId
    )
    assert.equal(resolving, true)
  })

  it('stops resolving once access-context has fetched', () => {
    const tenantId = 'org-1'
    const resolving = resolveIsResolvingAccess(
      {
        activeOrgId: 'org-1',
        accessContextOrgId: 'org-1',
        sessionOrgId: 'org-1',
        activatedOrganizationId: 'org-1',
        tokenReadyOrgId: 'org-1',
        pendingActiveId: null,
        accessQueryLoading: false,
        sessionPending: false,
        orgsLoading: false,
        bootstrapping: false,
        isSignedIn: true,
        accessQueryFetched: true,
        hasAccessContext: true,
      },
      tenantId
    )
    assert.equal(resolving, false)
  })
})
