# Project Map

## Core Structure
- / (Root)
  - CLAUDE.md          # Governance & Rules
  - Brain/PROJECT_MAP.md # This file (Map)
  - Brain/PROGRESS.md    # State Machine & Tasks
  - Brain/INFO.md        # Temp Buffer (Logs/Specs)
  - Brain/decisions/     # Architectural Log

## Application Files
- src/index.js: Bot entry point and client initialization.
- src/deploy-commands.js: Registers slash commands with Discord API.
- src/config.js: Environment variable and app configuration management.
- src/commands/: Implementation of bot slash commands.
- src/commands/changelog.js: Command for managing project changelogs.
- src/commands/feedback.js: Command for user feedback submission.
- src/commands/leaderboard.js: Command to display user rankings.
- src/commands/wolpertinger.js: Specialized command for Wolpertinger features.
- src/events/reactionHandler.js: Handles Discord message reaction events.
- src/services/: Business logic and core functionality modules.
- src/services/ApiClient.js: Wrapper for external API communication.
- src/services/AssetManager.js: Manages static assets and resources.
- src/services/ChangelogQueueProcessor.js: Processes queued changelog updates.
- src/services/DocsService.js: Documentation retrieval and processing.
- src/services/DocStatePoller.js: Polls for documentation changes.
- src/services/FeatureChannelService.js: Manages feature-specific Discord channels.
- src/services/FeedbackService.js: Processes and stores user feedback.
- src/services/ImageGenerator.js: Dynamic image creation using Canvas.
- src/services/LeaderboardService.js: Logic for calculating and retrieving scores.
- src/services/ModeDetector.js: Detects operational modes or states.
- src/services/UserService.js: User data management and profile logic.
- src/utils/ProgressBar.js: Utility for generating visual progress bars.
- src/utils/ImageValidator.js: Magic-byte validation for image uploads.
- config/: JSON storage for persistent state.

## Decisions Index
- Brain/decisions/*.md : Architektur-Entscheidungen (Immer prüfen, wenn Kernlogik geändert wird)
