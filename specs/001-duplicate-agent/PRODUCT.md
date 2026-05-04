# Duplicate Agent Profiles

## Summary

Add a `Duplicate agent` action in `Settings -> Agents` so users can create multiple launchable profiles from the same base agent harness, each with its own name, provider binding, and optional model override.

Example:

- `Codex Native`
- `Codex DeepSeek`
- `Codex Ollama gpt-oss:20b`

All three profiles use the Codex harness, but each launches with different provider settings.

## Problem

Today Tday stores one settings record per built-in agent id (`codex`, `claude-code`, `opencode`, etc.). That works for choosing one provider per harness, but it does not work well for users who want multiple variants of the same harness ready to launch.

Common workflow today:

- User likes Codex as the harness.
- User wants one Codex profile pointed at OpenAI.
- User wants another Codex profile pointed at DeepSeek.
- User wants another Codex profile pointed at a local Ollama model.

Current limitation:

- Only one `codex` entry exists in `Settings -> Agents`.
- Changing provider/model for Codex overwrites the previous choice.
- Users cannot keep several named Codex variants side by side.

## Goals

- Let users duplicate a base agent into multiple profiles.
- Let each duplicate have its own display name.
- Let users rename agent profiles after creation.
- Let users hide a profile from the new-tab agent list without deleting it.
- Let each duplicate bind to a different provider.
- Let each duplicate optionally override the model.
- Let duplicated profiles appear anywhere the user chooses an agent to launch.
- Preserve the current built-in agents model for users who do not use duplication.

## Non-Goals

- Duplicating provider profiles.
- Duplicating CoWorkers, cron jobs, or session history.
- Creating a totally new adapter/harness type from scratch.
- Changing how provider credentials are stored.

## User Stories

1. As a user, I can duplicate `Codex` and rename the copies so I can launch clearly labeled variants.
2. As a user, I can bind each duplicated agent profile to a different provider without affecting the others.
3. As a user, I can assign a different model override per duplicated profile.
4. As a user, I can set one duplicated profile as the default for new tabs.
5. As a user, I can remove a duplicated profile without removing the underlying built-in harness.
6. As a user, I can rename an existing profile later if I want to repurpose it for another provider or model.
7. As a user, I can hide a profile from the new-tab list while keeping its settings and installed harness intact.

## UX Proposal

### Settings -> Agents

For each agent row or details panel, add an action:

- `Duplicate agent`

When clicked:

1. Create a new profile based on the selected base agent.
2. Copy these fields from the source profile:
   - base agent id
   - provider binding
   - model override
   - launch args or custom bin path if those are supported for that agent
3. Assign a default new display name using the original name plus ` Duplicate`.
4. Select the new duplicate immediately so the user can edit it.

Example:

- `Codex` -> `Codex Duplicate`
- `Codex DeepSeek` -> `Codex DeepSeek Duplicate`

All profiles can be renamed later, so the default duplicate name does not need to be permanent.

### Example Result

If the user duplicates `Codex`, the agent list could become:

- `Codex`
- `Codex Native`
- `Codex DeepSeek`
- `Codex Ollama gpt-oss:20b`

Each item is independently selectable in the launcher and in `Settings -> Agents`.

### Profile Editing

Each duplicated profile should support:

- display name
- provider binding
- model override
- hide from new-tab list
- default-agent toggle
- delete action for duplicates

Built-in base profiles should not require deletion support. Duplicates should. Users should be able to rename both built-in profiles and duplicates.

### Entry Points

Duplicated profiles should appear in:

- the new-tab agent picker
- any agent dropdown in the main UI
- cron job agent selection, if cron is profile-based rather than base-agent-based

Hidden profiles should not appear in the new-tab agent picker.

## Functional Requirements

### FR1. Duplicate from any existing agent profile

The user can duplicate:

- a built-in base agent profile
- an already duplicated profile

Duplicating a duplicate creates another profile with copied settings.

The new duplicate must receive a default display name derived from the source profile name by appending ` Duplicate`.

### FR2. Separate identity from base harness

Each launchable item must have:

- a stable profile id
- a base agent id that points to the real adapter (`codex`, `claude-code`, etc.)
- a user-visible display name

This is the key product requirement. Without separating profile id from base agent id, the feature collapses back into the current one-config-per-agent limitation.

### FR3. Independent provider and model settings

Each duplicated profile stores its own:

- `providerId`
- `model`

Editing one profile must not modify any sibling profile created from the same base agent.

### FR4. Rename support

The user can rename any agent profile through `Settings -> Agents`.

Rename rules:

- renaming a profile changes only its display name
- renaming must not change the underlying base agent id
- renaming must not change provider/model bindings
- duplicate names should either be prevented or clearly disambiguated

### FR5. Default agent support

The user can mark any profile, including a duplicate, as the default for new tabs.

### FR6. Visibility control

The user can hide or unhide any profile through `Settings -> Agents`.

Hide rules:

- hiding a profile removes it from the new-tab agent picker
- hiding a profile does not uninstall the underlying harness
- hiding a profile does not delete provider/model settings
- hidden profiles remain editable in `Settings -> Agents`

### FR7. Safe delete

The user can delete duplicated profiles.

Delete rules:

- deleting a duplicate must not delete the base built-in harness
- deleting a duplicate must not delete provider profiles
- if the deleted profile was the default, Tday should fall back to a sensible default and show that clearly

### FR8. Analytics identity

Usage analytics should support both grouping modes:

- by base agent
- by agent profile

This lets users answer both questions:

- "How much do I use Codex overall?"
- "How much do I use Codex DeepSeek versus Codex Ollama?"

### FR9. Session restore behavior

When session history is restored, Tday should reopen against the original profile id when possible.

Fallback behavior:

- if the original profile still exists, restore using that profile
- if the original profile was deleted, show the original profile name with ` (deleted)` appended
- if the original profile was deleted, do not silently switch to an unrelated profile

### FR10. Backward compatibility

Existing users with current `agents.json` should upgrade without losing settings.

Migration should preserve:

- current built-in agent provider bindings
- current model overrides
- current default agent selection

## Data Model Direction

Current model is effectively:

```json
{
  "defaultAgentId": "codex",
  "agents": {
    "codex": { "providerId": "openai", "model": "gpt-5" }
  }
}
```

Feature requires a profile-based model, conceptually:

```json
{
  "defaultProfileId": "codex-deepseek",
  "profiles": [
    {
      "id": "codex-default",
      "baseAgentId": "codex",
      "displayName": "Codex",
      "providerId": "openai",
      "model": "gpt-5"
    },
    {
      "id": "codex-deepseek",
      "baseAgentId": "codex",
      "displayName": "Codex DeepSeek",
      "providerId": "deepseek",
      "model": "deepseek-v4-pro"
    },
    {
      "id": "codex-ollama-gpt-oss-20b",
      "baseAgentId": "codex",
      "displayName": "Codex Ollama gpt-oss:20b",
      "providerId": "ollama-local",
      "model": "gpt-oss:20b"
    }
  ]
}
```

Exact schema can vary, but product behavior depends on this distinction:

- `baseAgentId` chooses the harness implementation
- `profile id` chooses the saved user configuration

## Migration Requirements

On first launch after upgrade:

1. Convert each existing built-in agent config into one default profile for that base agent.
2. Preserve the current display label for built-ins.
3. Map `defaultAgentId` to the corresponding default profile id.
4. Do not create duplicates unless the user explicitly asks for them.

## Edge Cases

- If a provider used by a duplicate is later deleted, show the profile as misconfigured rather than deleting it.
- If shared-provider mode still exists, define whether it applies to base agents or all profiles. Product recommendation: shared-provider mode should apply to all profiles, but this may reduce the value of duplicates and may need reevaluation.
- If cron jobs point to an agent, define whether they should migrate to `profileId`. Product recommendation: yes, cron should target profile id after this feature.

## Acceptance Criteria

1. In `Settings -> Agents`, a user can duplicate `Codex`.
2. The duplicate appears immediately in the agents list with a separate display name derived from the source name, for example `Codex Duplicate`.
3. The original `Codex` profile remains unchanged when the duplicate's provider is changed.
4. Two or more Codex-based profiles can coexist with different providers and models.
5. A user can rename any profile from `Settings -> Agents`, and the new name appears anywhere that profile is selectable.
6. A hidden profile does not appear in the new-tab agent picker even when its base harness is installed.
7. Unhiding the profile makes it appear in the new-tab agent picker again.
8. Any duplicated profile can be launched from the normal agent picker.
9. Any duplicated profile can be set as default.
10. A duplicated profile can be deleted without affecting the original base agent.
11. Usage analytics can be viewed by base agent and by profile.
12. Restoring session history reuses the original profile id when that profile still exists.
13. If a restored session references a deleted profile, Tday shows that profile name with ` (deleted)` appended.
14. Existing users upgrade without losing current agent/provider/model settings.

## Recommendation

Implement this as `agent profiles`, not as a second settings record keyed by built-in `AgentId`.

That gives Tday a clean path for:

- duplicate agent
- named variants
- community/custom agent presets later
- profile-based cron and history integration
