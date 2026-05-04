# BDD: Duplicate Agent Profiles

## Feature: Duplicate agent profiles

Tday should let users create multiple named profiles from the same base agent harness so each profile can target a different provider and model.

### Scenario: Duplicate a built-in agent profile

Given `Codex` exists as a built-in agent profile
And `Codex` is bound to provider `openai`
When the user opens `Settings -> Agents`
And the user selects `Codex`
And the user clicks `Duplicate agent`
Then Tday creates a new agent profile based on `Codex`
And the new profile has a different stable profile id from `Codex`
And the new profile keeps base agent id `codex`
And the new profile name is `Codex Duplicate`
And the new profile copies the source profile's provider binding
And the new profile copies the source profile's model override
And the new profile is selected for editing immediately

### Scenario: Duplicate an already duplicated profile

Given a duplicated profile named `Codex DeepSeek` exists
And `Codex DeepSeek` uses base agent id `codex`
When the user duplicates `Codex DeepSeek`
Then Tday creates another profile with a new stable profile id
And the new profile keeps base agent id `codex`
And the new profile name is `Codex DeepSeek Duplicate`
And the new profile copies the source profile's provider and model settings

### Scenario: Rename any profile

Given an agent profile named `Codex DeepSeek` exists
When the user renames it to `Codex DeepSeek Fast`
Then the profile display name becomes `Codex DeepSeek Fast`
And the stable profile id does not change
And the base agent id does not change
And the provider binding does not change
And the model override does not change

### Scenario: Built-in profile can be renamed

Given a built-in profile named `Codex` exists
When the user renames it to `Codex Native`
Then the profile display name becomes `Codex Native`
And the base agent id remains `codex`

### Scenario: Two profiles from the same base agent can use different providers

Given a profile named `Codex Native` exists for base agent `codex`
And a profile named `Codex DeepSeek` exists for base agent `codex`
When the user binds `Codex Native` to provider `openai`
And the user binds `Codex DeepSeek` to provider `deepseek`
Then `Codex Native` keeps provider `openai`
And `Codex DeepSeek` keeps provider `deepseek`
And changing one profile does not modify the other

### Scenario: Two profiles from the same base agent can use different models

Given a profile named `Codex DeepSeek` exists for base agent `codex`
And a profile named `Codex Ollama` exists for base agent `codex`
When the user sets model `deepseek-v4-pro` on `Codex DeepSeek`
And the user sets model `gpt-oss:20b` on `Codex Ollama`
Then each profile keeps its own model override

### Scenario: Duplicated profiles appear in launch surfaces

Given profiles named `Codex Native` and `Codex DeepSeek` exist
When the user opens the new-tab agent picker
Then both `Codex Native` and `Codex DeepSeek` are listed as launchable agents
When the user opens any other agent-selection dropdown
Then both `Codex Native` and `Codex DeepSeek` are listed there too

### Scenario: Set a duplicated profile as the default

Given profiles named `Codex Native` and `Codex DeepSeek` exist
When the user marks `Codex DeepSeek` as the default profile
Then new tabs use `Codex DeepSeek` by default
And the default is stored by profile id rather than base agent id

### Scenario: Delete a duplicated profile

Given a duplicated profile named `Codex Ollama gpt-oss:20b` exists
When the user deletes `Codex Ollama gpt-oss:20b`
Then that profile is removed
And the underlying base agent `codex` still exists
And no provider profile is deleted

### Scenario: Delete the current default duplicated profile

Given a duplicated profile named `Codex DeepSeek` is the default profile
When the user deletes `Codex DeepSeek`
Then Tday selects a sensible fallback default profile
And the UI makes the new default clear to the user

### Scenario: Show misconfigured profile when provider is deleted

Given a profile named `Codex DeepSeek` is bound to provider `deepseek`
When provider `deepseek` is deleted
Then `Codex DeepSeek` remains in the agent profile list
And `Codex DeepSeek` is shown as misconfigured
And Tday does not delete the profile automatically

## Feature: Usage analytics for agent profiles

Usage analytics should support both base-agent and profile-level views.

### Scenario: View usage grouped by base agent

Given usage records exist for `Codex Native` and `Codex DeepSeek`
And both profiles use base agent `codex`
When the user groups usage analytics by base agent
Then Tday shows combined usage for `codex`

### Scenario: View usage grouped by profile

Given usage records exist for `Codex Native` and `Codex DeepSeek`
When the user groups usage analytics by profile
Then Tday shows separate usage for `Codex Native`
And Tday shows separate usage for `Codex DeepSeek`

## Feature: Restore sessions with profile identity

Restored sessions should reopen against the original profile when possible.

### Scenario: Restore session with original profile still present

Given a saved session was created with profile `Codex DeepSeek`
And profile `Codex DeepSeek` still exists
When the user restores that session
Then Tday restores it using the original profile id

### Scenario: Restore session after the original profile was deleted

Given a saved session was created with profile `Codex DeepSeek`
And profile `Codex DeepSeek` has been deleted
When the user views or restores that session
Then Tday shows the profile name as `Codex DeepSeek (deleted)`
And Tday does not silently switch the session to another profile

## Feature: Migrate existing agent settings

Existing users should keep their settings after the feature is introduced.

### Scenario: Migrate one-config-per-agent settings to profile-based settings

Given an existing user has legacy `agents.json` settings
And legacy `Codex` is bound to provider `openai`
And legacy `Codex` has model override `gpt-5`
And legacy `Codex` is the default agent
When Tday migrates settings to the new profile-based model
Then Tday creates one default profile for base agent `codex`
And the migrated profile keeps provider `openai`
And the migrated profile keeps model `gpt-5`
And the migrated profile becomes the default by profile id

### Scenario: Migration does not create extra duplicates

Given an existing user has legacy built-in agent settings
When Tday migrates those settings
Then Tday creates one default profile per legacy built-in agent configuration
And Tday does not create additional duplicated profiles automatically
