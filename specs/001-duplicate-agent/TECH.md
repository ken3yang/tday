# TECH: Duplicate Agent Profiles

## Goal

Implement `Duplicate agent` as a profile system layered on top of existing built-in harness adapters.

The key technical rule is:

- `baseAgentId` selects the real harness implementation such as `codex`
- `profileId` selects the saved user configuration and display name

Without that split, duplicate profiles cannot coexist.

## Current State

Today the app is keyed directly by built-in `AgentId`.

Current consequences:

- `agents.json` stores one config per built-in agent id
- `agents:list` returns one row per built-in agent
- tabs store only `agentId`
- spawn resolves provider/model from `req.agentId`
- cron jobs target only `agentId`
- tab history stores only `agentId`
- usage aggregates only by `agentId`

Files that currently assume `agentId === launchable item`:

- [packages/shared/src/index.ts](/Users/ken/github/tday/packages/shared/src/index.ts)
- [apps/desktop/src/main/config.ts](/Users/ken/github/tday/apps/desktop/src/main/config.ts)
- [apps/desktop/src/main/index.ts](/Users/ken/github/tday/apps/desktop/src/main/index.ts)
- [apps/desktop/src/preload/index.ts](/Users/ken/github/tday/apps/desktop/src/preload/index.ts)
- [apps/desktop/src/renderer/src/Settings/AgentsSection.tsx](/Users/ken/github/tday/apps/desktop/src/renderer/src/Settings/AgentsSection.tsx)
- [apps/desktop/src/renderer/src/types/tab.ts](/Users/ken/github/tday/apps/desktop/src/renderer/src/types/tab.ts)
- [apps/desktop/src/renderer/src/hooks/useTabs.ts](/Users/ken/github/tday/apps/desktop/src/renderer/src/hooks/useTabs.ts)
- [apps/desktop/src/renderer/src/Terminal.tsx](/Users/ken/github/tday/apps/desktop/src/renderer/src/Terminal.tsx)

## Proposed Model

Introduce `agent profiles`.

Each launchable profile has:

- `profileId: string`
- `baseAgentId: AgentId`
- `displayName: string`
- `hidden?: boolean`
- `providerId?: string`
- `model?: string`
- `bin?: string`
- `args?: string[]`
- `isBuiltinProfile?: boolean`
- `createdAt?: number`

Built-in harnesses still exist, but only as adapter/install definitions. The UI launches profiles, not bare base agents.

## Config Schema

Replace the legacy `AgentsConfig` layout with a profile-based schema.

```ts
export interface AgentProfile {
  id: string;
  baseAgentId: AgentId;
  displayName: string;
  hidden?: boolean;
  providerId?: string;
  model?: string;
  bin?: string;
  args?: string[];
  isBuiltinProfile?: boolean;
  createdAt?: number;
}

export interface AgentsConfigV2 {
  version: 2;
  defaultProfileId?: string;
  profiles: AgentProfile[];
}
```

Loader rule:

- `loadAgents()` should accept both legacy and v2 shapes
- legacy shape should be migrated in memory immediately
- writes should always persist v2

## Naming Rules

Duplicate-name generation should be deterministic.

Base rule:

- default duplicate name is `<original name> Duplicate`

Visibility rule:

- hidden profiles remain persisted and editable
- hidden profiles are excluded from the new-tab picker

Collision rule:

- if the generated name already exists, append a numeric suffix
- example: `Codex Duplicate 2`
- example: `Codex Duplicate 3`

This avoids blocking the action on naming and keeps rename optional.

## Shared Types

Update [packages/shared/src/index.ts](/Users/ken/github/tday/packages/shared/src/index.ts).

### Keep

- `AgentId` remains the enum of built-in harness ids

### Add

```ts
export type AgentProfileId = string;

export interface AgentProfile {
  id: AgentProfileId;
  baseAgentId: AgentId;
  displayName: string;
  hidden?: boolean;
  providerId?: string;
  model?: string;
  bin?: string;
  args?: string[];
  isBuiltinProfile?: boolean;
  createdAt?: number;
}

export interface AgentsConfig {
  version?: 2;
  defaultProfileId?: AgentProfileId;
  profiles?: AgentProfile[];

  // legacy read-only compatibility
  defaultAgentId?: AgentId;
  agents?: Partial<Record<AgentId, AgentSettings>>;
}

export interface AgentProfileInfo {
  profileId: AgentProfileId;
  baseAgentId: AgentId;
  displayName: string;
  description?: string;
  npmPackage?: string;
  detect: { available: boolean; version?: string; error?: string };
  providerId?: string;
  model?: string;
  isDefault?: boolean;
  hidden?: boolean;
  isBuiltinProfile?: boolean;
  missingProvider?: boolean;
}
```

### Change

`SpawnRequest` should carry both profile identity and base harness identity.

```ts
export interface SpawnRequest {
  tabId: string;
  agentId: AgentId;
  agentProfileId?: string;
  providerId?: string;
  model?: string;
  cwd?: string;
  cols: number;
  rows: number;
  agentSessionId?: string;
  initialPrompt?: string;
  isCronJob?: boolean;
  coworkerId?: string;
}
```

Design choice:

- keep `agentId` as the base harness id to minimize launch-path churn
- add `agentProfileId` for profile config lookup

### History and Usage Metadata

Add profile metadata to shared records owned by Tday:

```ts
export interface TabHistoryEntry {
  histId: string;
  title: string;
  agentId: AgentId;
  agentProfileId?: string;
  agentProfileName?: string;
  profileDeleted?: boolean;
  providerId?: string;
  model?: string;
  cwd: string;
  closedAt: number;
  agentSessionId?: string;
}
```

```ts
export interface UsageRecord {
  ts: number;
  agentId: AgentId | string;
  agentProfileId?: string;
  agentProfileName?: string;
  providerId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  toolCalls?: number;
}
```

`CronJob` and `CronFireEvent` should also gain profile identity:

```ts
export interface CronJob {
  id: string;
  name: string;
  agentId: AgentId;
  agentProfileId?: string;
  cwd: string;
  prompt: string;
  schedule: string;
  enabled: boolean;
  createdAt: number;
  coworkerId?: string;
}
```

## Migration

Implement migration in [apps/desktop/src/main/config.ts](/Users/ken/github/tday/apps/desktop/src/main/config.ts).

### Read Path

`loadAgents()` should:

1. Read raw `agents.json`
2. If `profiles` exists, normalize and return v2
3. Otherwise convert legacy records into v2

### Legacy to V2 Mapping

For each built-in `AgentId` in install specs:

- create one builtin profile
- `profile.id = <agentId>`
- `profile.baseAgentId = <agentId>`
- `profile.displayName = built-in display label`
- copy `providerId`, `model`, `bin`, and `args` from legacy `agents[agentId]`
- set `isBuiltinProfile = true`

Default mapping:

- `defaultProfileId = legacy.defaultAgentId ?? 'pi'`

### Write Path

All future `agentsSave` writes should persist only:

```json
{
  "version": 2,
  "defaultProfileId": "codex",
  "profiles": []
}
```

## Main Process Changes

### Config Resolution

Add helpers in [apps/desktop/src/main/config.ts](/Users/ken/github/tday/apps/desktop/src/main/config.ts) or a new `agent-profiles.ts` module:

- `loadAgentProfiles()`
- `normalizeAgentsConfig()`
- `migrateLegacyAgentsConfig()`
- `findProfileById(profileId)`
- `findDefaultProfile()`
- `makeDuplicateProfile(profile)`
- `makeUniqueProfileName(name, profiles)`

### IPC: Agent List

Current `IPC.agentsList` returns built-in agents. Change it to return profile rows.

Implementation in [apps/desktop/src/main/index.ts](/Users/ken/github/tday/apps/desktop/src/main/index.ts):

- iterate profiles from `AgentsConfigV2`
- join each profile with install metadata from `INSTALL_SPECS[baseAgentId]`
- run install detection from the base harness, not from the profile id
- mark `isDefault` by `defaultProfileId`

Important:

- installer actions still target `baseAgentId`
- duplicate/delete/rename actions target `profileId`

### IPC: Save Profiles

Keep `IPC.agentsSave`, but redefine the payload as v2 profile config.

That avoids IPC proliferation and keeps the renderer flow simple.

### Spawn Resolution

Update [apps/desktop/src/main/index.ts](/Users/ken/github/tday/apps/desktop/src/main/index.ts).

Current logic:

- resolve `agentConf = agents.agents?.[req.agentId]`

New logic:

1. Resolve profile by `req.agentProfileId`
2. Fallback to builtin profile whose id matches `req.agentId`
3. Resolve provider from:
   - `req.providerId`
   - else `profile.providerId`
   - else `providers.default`
4. Resolve model from:
   - `req.model`
   - else `profile.model`
   - else provider default
5. Resolve binary and extra args from:
   - `profile.bin`
   - `profile.args`
   - install spec for `profile.baseAgentId`

Launch-path rule:

- use `req.agentId` or `profile.baseAgentId` for adapter-specific switch statements
- never use `profileId` as a harness selector

### Install / Update / Uninstall

No profile-level install semantics.

Install buttons should operate on `baseAgentId` only:

- installing Codex enables all Codex-based profiles
- uninstalling Codex disables all Codex-based profiles

## Renderer Changes

### Replace `AgentInfo` with `AgentProfileInfo`

Update these renderer surfaces:

- [apps/desktop/src/renderer/src/App.tsx](/Users/ken/github/tday/apps/desktop/src/renderer/src/App.tsx)
- [apps/desktop/src/renderer/src/components/TabBar.tsx](/Users/ken/github/tday/apps/desktop/src/renderer/src/components/TabBar.tsx)
- [apps/desktop/src/renderer/src/components/LogoMenu.tsx](/Users/ken/github/tday/apps/desktop/src/renderer/src/components/LogoMenu.tsx)
- [apps/desktop/src/renderer/src/Settings/AgentsSection.tsx](/Users/ken/github/tday/apps/desktop/src/renderer/src/Settings/AgentsSection.tsx)
- [apps/desktop/src/renderer/src/Settings/CronSection.tsx](/Users/ken/github/tday/apps/desktop/src/renderer/src/Settings/CronSection.tsx)

UI rows should render:

- `displayName` from profile
- status/install details from base harness
- provider/model from profile
- hidden state from profile

### Agent Settings UI

Update [apps/desktop/src/renderer/src/Settings/AgentsSection.tsx](/Users/ken/github/tday/apps/desktop/src/renderer/src/Settings/AgentsSection.tsx).

Required actions:

- rename profile
- duplicate profile
- delete duplicate profile
- hide/unhide profile
- bind provider
- edit model override
- set default profile

Built-in profile rule:

- rename allowed
- delete not allowed

Duplicate profile rule:

- rename allowed
- delete allowed

Shared-provider toggle:

- keep existing behavior for now
- when enabled, apply provider/model changes to all profiles
- persist against profile rows, not base agents

Hide toggle:

- persist `hidden` on the profile
- exclude `hidden === true` profiles from the new-tab picker
- do not hide them from `Settings -> Agents`

### Tabs

Update [apps/desktop/src/renderer/src/types/tab.ts](/Users/ken/github/tday/apps/desktop/src/renderer/src/types/tab.ts).

Current tab state is missing profile identity. Add:

```ts
export interface Tab {
  id: string;
  epoch: number;
  title: string;
  agentId: AgentId;
  agentProfileId?: string;
  agentProfileName?: string;
  cwd: string;
  cwdDraft: string;
  agentSessionId?: string;
  initialPrompt?: string;
  isCronJob?: boolean;
  coworkerId?: string;
}
```

Rules:

- `agentId` remains the base harness id
- `agentProfileId` identifies the selected launch profile
- `agentProfileName` is a denormalized label for titles/history when the profile is later renamed or deleted

`newTab()` should accept both base and profile identity.

Tab title rule:

- default title should use `agentProfileName` when present
- fallback to `agentTitle(agentId)` only for legacy or unknown cases

### Terminal Spawn

Update [apps/desktop/src/renderer/src/Terminal.tsx](/Users/ken/github/tday/apps/desktop/src/renderer/src/Terminal.tsx).

`window.tday.spawn()` payload should include:

- `agentId`
- `agentProfileId`

Session resume helpers should still call:

- `latestAgentSession(baseAgentId, cwd)`
- `readAgentSession(baseAgentId, sessionId, cwd)`

Those APIs operate on harness-native session files, not profile config.

## History Design

### Tab History

Update [apps/desktop/src/main/tab-history.ts](/Users/ken/github/tday/apps/desktop/src/main/tab-history.ts) and `useTabs`.

Persist with each closed tab:

- `agentId`
- `agentProfileId`
- `agentProfileName`
- `providerId`
- `model`

Why keep snapshot fields:

- restore can still show `Codex DeepSeek (deleted)` after the profile is removed
- restore can relaunch with the last known provider/model snapshot if needed

Deleted-profile restore behavior:

- if `agentProfileId` still exists, restore normally
- if it does not exist, render `agentProfileName + " (deleted)"`
- do not silently map to another profile

### Agent History

Native session history scanners in [apps/desktop/src/main/agent-history](/Users/ken/github/tday/apps/desktop/src/main/agent-history) only know base harness ids.

Design:

- keep `AgentHistoryEntry.agentId` as base harness id
- add optional `agentProfileId` and `agentProfileName` when the session can be correlated to a Tday-launched profile

Correlation source:

- add a lightweight `session-profile-index.json`
- key by `<baseAgentId>:<sessionId>`
- value stores `profileId`, `profileName`, `providerId`, and `model`

Write to that index when:

- a live tab learns its `agentSessionId`
- a tab is closed and saved to history

Read from that index when:

- listing agent history
- building session-cache usage records

Fallback:

- sessions not launched by Tday remain base-agent-only

## Cron Design

Update [packages/shared/src/index.ts](/Users/ken/github/tday/packages/shared/src/index.ts), [apps/desktop/src/main/index.ts](/Users/ken/github/tday/apps/desktop/src/main/index.ts), and renderer cron settings.

Rules:

- cron jobs should target `agentProfileId`
- `agentId` remains stored too for base harness execution
- existing cron jobs migrate by pointing to the builtin profile whose id matches the legacy `agentId`

When cron fires:

- event carries `agentId`, `agentProfileId`, and job metadata
- created tab inherits both

## Usage Analytics Design

### Record Shape

Extend `UsageRecord` with:

- `agentProfileId?: string`
- `agentProfileName?: string`

### Live Usage Capture

For usage captured from:

- gateway adapters
- PTY scraping

the main process already knows the active tab and profile. Those records should be written with both:

- `agentId = baseAgentId`
- `agentProfileId`

### Session Cache and Native History

Records derived from native session files should be enriched from `session-profile-index.json` when possible.

Fallback:

- if no profile mapping exists, keep only `agentId`

### Query API

Extend usage query types to support grouping mode.

```ts
export interface UsageFilter {
  fromTs?: number;
  toTs?: number;
  agentId?: string;
  agentProfileId?: string;
  providerId?: string;
  groupBy?: 'base-agent' | 'profile';
}
```

`UsageSummary` should include both:

- `byAgent`
- `byProfile`

This avoids requery churn in the renderer and matches the product requirement directly.

## Deleted Profile Behavior

Deleting a profile should remove it from `AgentsConfigV2.profiles`.

It should not remove:

- tab history entries
- agent history correlation entries
- usage records

Rendering rule for stale references:

- show stored `agentProfileName` with ` (deleted)` appended

Launch rule for stale restore:

- restore using stored `agentId`
- pass stored `providerId` and `model` snapshot when available
- do not replace with another live profile id

## Validation Rules

Enforce in main before save:

- every profile id is unique
- every display name is non-empty after trim
- every `defaultProfileId` exists
- every `baseAgentId` is a known `AgentId`

UI-level checks:

- rename input trims whitespace
- duplicate names are auto-disambiguated
- deleting the current default picks a fallback existing profile

## Suggested File Changes

### Shared

- [packages/shared/src/index.ts](/Users/ken/github/tday/packages/shared/src/index.ts)

### Main

- [apps/desktop/src/main/config.ts](/Users/ken/github/tday/apps/desktop/src/main/config.ts)
- [apps/desktop/src/main/index.ts](/Users/ken/github/tday/apps/desktop/src/main/index.ts)
- [apps/desktop/src/main/tab-history.ts](/Users/ken/github/tday/apps/desktop/src/main/tab-history.ts)
- `apps/desktop/src/main/agent-profiles.ts` new helper module
- `apps/desktop/src/main/session-profile-index.ts` new helper module
- [apps/desktop/src/main/usage/store.ts](/Users/ken/github/tday/apps/desktop/src/main/usage/store.ts)
- `apps/desktop/src/main/usage/query.ts` optional split if summary logic grows

### Preload

- [apps/desktop/src/preload/index.ts](/Users/ken/github/tday/apps/desktop/src/preload/index.ts)

### Renderer

- [apps/desktop/src/renderer/src/App.tsx](/Users/ken/github/tday/apps/desktop/src/renderer/src/App.tsx)
- [apps/desktop/src/renderer/src/types/tab.ts](/Users/ken/github/tday/apps/desktop/src/renderer/src/types/tab.ts)
- [apps/desktop/src/renderer/src/hooks/useTabs.ts](/Users/ken/github/tday/apps/desktop/src/renderer/src/hooks/useTabs.ts)
- [apps/desktop/src/renderer/src/Terminal.tsx](/Users/ken/github/tday/apps/desktop/src/renderer/src/Terminal.tsx)
- [apps/desktop/src/renderer/src/components/TabBar.tsx](/Users/ken/github/tday/apps/desktop/src/renderer/src/components/TabBar.tsx)
- [apps/desktop/src/renderer/src/components/LogoMenu.tsx](/Users/ken/github/tday/apps/desktop/src/renderer/src/components/LogoMenu.tsx)
- [apps/desktop/src/renderer/src/Settings/AgentsSection.tsx](/Users/ken/github/tday/apps/desktop/src/renderer/src/Settings/AgentsSection.tsx)
- [apps/desktop/src/renderer/src/Settings/CronSection.tsx](/Users/ken/github/tday/apps/desktop/src/renderer/src/Settings/CronSection.tsx)
- [apps/desktop/src/renderer/src/Settings/UsageSection.tsx](/Users/ken/github/tday/apps/desktop/src/renderer/src/Settings/UsageSection.tsx)

## Rollout Plan

### Phase 1

- add v2 config types and migration
- return profile-based agent list
- update Settings -> Agents UI for rename, duplicate, delete, default
- update tab creation and spawn to pass profile identity

### Phase 2

- migrate cron to profile-aware storage
- add history profile snapshots and deleted-profile rendering

### Phase 3

- add usage `byProfile`
- add session-profile correlation for native history and session-cache enrichment

This split reduces the initial blast radius while preserving a clean end state.

## Tests

### Unit

- config migration from legacy to v2
- duplicate-name generation
- duplicate profile cloning
- default-profile fallback after delete
- validation rejects unknown `baseAgentId`

### Main Process

- `agents:list` returns multiple rows for the same `baseAgentId`
- spawn resolves provider/model from `agentProfileId`
- install actions still work by `baseAgentId`
- tab history restore marks deleted profiles correctly

### Renderer

- duplicate action creates `Name Duplicate`
- rename updates visible labels everywhere
- deleting duplicate removes only that profile
- default radio tracks `defaultProfileId`
- cron editor stores `agentProfileId`

### Usage

- summary groups by base agent
- summary groups by profile
- records without profile mapping still contribute to base-agent totals

## Risks

- this feature touches many identity assumptions at once
- history and usage are the most subtle areas because they combine live Tday state with native agent session files
- keeping `agentId` as base harness and adding `agentProfileId` is the safest way to limit launch-path regressions

## Recommendation

Implement a full `agent profiles` model now rather than trying to special-case duplication inside the existing one-record-per-`AgentId` config.

That is the smallest design that correctly supports:

- duplicate agent
- rename any profile
- default duplicate naming
- profile-aware cron
- profile-aware history
- analytics by base agent and by profile
