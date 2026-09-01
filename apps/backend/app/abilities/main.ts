/*
|--------------------------------------------------------------------------
| Bouncer abilities
|--------------------------------------------------------------------------
|
| Cross-cutting gates not tied to a single resource instance.
| Prefer policies when the check needs a loaded model/DTO.
|
| This module must only export Bouncer.ability() values — InitializeBouncerMiddleware
| imports it as `abilities` and plain helpers break the Bouncer generic.
|
*/

import { Bouncer } from '@adonisjs/bouncer'
import { isOrgAdmin, isPlatformActor } from '#abilities/authz_predicates'
import type { AuthzPrincipal } from '#types/http'

export const accessOrgAdmin = Bouncer.ability((user: AuthzPrincipal) => isOrgAdmin(user))

export const accessPlatform = Bouncer.ability((user: AuthzPrincipal) => isPlatformActor(user))
