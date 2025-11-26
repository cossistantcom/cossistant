# @cossistant/react

## 0.0.25

### Patch Changes

- 11f48ba: Bug fixes and improvements
- Updated dependencies [11f48ba]
  - @cossistant/types@0.0.25
  - @cossistant/core@0.0.25

## 0.0.24

### Patch Changes

- c21911f: Bug fixes and improvements
- Updated dependencies [c21911f]
  - @cossistant/types@0.0.24
  - @cossistant/core@0.0.24

## 0.0.23

### Patch Changes

- 46d3f17: Release new version of all packages including @cossistant/next
- Updated dependencies [46d3f17]
  - @cossistant/core@0.0.23
  - @cossistant/types@0.0.23

## 0.0.22

### Patch Changes

- Release new version of all packages including @cossistant/next
- Updated dependencies
  - @cossistant/core@0.0.22
  - @cossistant/types@0.0.22

## 0.0.21

### Patch Changes

- Release new version of all packages including @cossistant/next
- Updated dependencies
  - @cossistant/core@0.0.21
  - @cossistant/types@0.0.21

## 0.0.20

### Patch Changes

- Bug fixes for better compatibility with Next.js
- Updated dependencies
  - @cossistant/core@0.0.20
  - @cossistant/types@0.0.20

## 0.0.19

### Patch Changes

- Fix discount calculation and validation logic
- Updated dependencies
  - @cossistant/core@0.0.19
  - @cossistant/types@0.0.19

## 0.0.18

### Patch Changes

- Remove tailwind-scrollbar dependency completely - replaced with native CSS scrollbar styling using scrollbar-width and ::-webkit-scrollbar pseudo-elements
  - @cossistant/core@0.0.18
  - @cossistant/types@0.0.18

## 0.0.17

### Patch Changes

- Remove tailwind-scrollbar dependency and replace with native CSS scrollbar styling to eliminate the need for users to install additional packages
  - @cossistant/core@0.0.17
  - @cossistant/types@0.0.17

## 0.0.16

### Patch Changes

- c21911f: Patch release
- Updated dependencies [c21911f]
  - @cossistant/core@0.0.16
  - @cossistant/types@0.0.16

## 0.0.15

### Patch Changes

- c21911f: Patch release
- Updated dependencies [c21911f]
  - @cossistant/core@0.0.15
  - @cossistant/types@0.0.15

## 0.0.14

### Patch Changes

- Patch release
- Updated dependencies
  - @cossistant/core@0.0.14
  - @cossistant/types@0.0.14

## 0.0.13

### Patch Changes

- Patch release with latest updates and improvements
- Updated dependencies
  - @cossistant/core@0.0.13
  - @cossistant/types@0.0.13

## 0.0.12

### Patch Changes

- Patch release with latest updates and improvements
- Updated dependencies
  - @cossistant/core@0.0.12
  - @cossistant/types@0.0.12

## 0.0.11

### Patch Changes

- e5ad60d: Release version 0.0.10
- Release version 0.0.11 with bug fixes and improvements
- Updated dependencies [e5ad60d]
- Updated dependencies
  - @cossistant/core@0.0.11
  - @cossistant/types@0.0.11

## 0.0.10

### Patch Changes

- Release version 0.0.10
- Updated dependencies
  - @cossistant/core@0.0.10
  - @cossistant/types@0.0.10

## 0.0.9

### Patch Changes

- Bug fixes and improvements
- Updated dependencies
  - @cossistant/types@0.0.9
  - @cossistant/core@0.0.9

## 0.0.8

### Patch Changes

- Release new version of packages
- Updated dependencies
  - @cossistant/types@0.0.8
  - @cossistant/core@0.0.8

## 0.0.7

### Patch Changes

- aa0ecdc: Documentation enhancements and dependency updates
  - Updated Tailwind CSS to v4.1.13 for improved compatibility
  - Enhanced package README with clearer installation and CSS import guidance
  - Improved quickstart documentation with better code examples
  - Added comprehensive examples README for common use cases
  - Enhanced navigation dropdown and onboarding flow components
  - @cossistant/core@0.0.7
  - @cossistant/types@0.0.7

## 0.0.6

### Patch Changes

- Documentation enhancements and dependency updates
  - Updated Tailwind CSS to v4.1.13 for improved compatibility
  - Enhanced package README with clearer installation and CSS import guidance
  - Improved quickstart documentation with better code examples
  - Added comprehensive examples README for common use cases
  - Enhanced navigation dropdown and onboarding flow components
  - @cossistant/core@0.0.6
  - @cossistant/types@0.0.6

## 0.0.5

### Patch Changes

- 6bf7fb5: Performance optimizations and conversation timeline stability improvements. This release includes significant fixes for timeline auto-scroll behavior, conversation button primitive refactoring, and visitor blocking support. Dashboard improvements include redesigned contact pages, better timeline animations, and visitor blocking UI indicators.
- 49f0cb9: Widget navigation and conversation tracking improvements. This release includes enhanced conversation visibility tracking, improved message handling logic for users and AI agents, better navigation flow and conversation history, and disabled visitor replies on closed conversations. Dashboard improvements include better inbox interface and enhanced landing page animations with synchronized fake dashboard demo.
  - @cossistant/core@0.0.5
  - @cossistant/types@0.0.5

## 0.0.4

### Patch Changes

- Performance optimizations and conversation timeline stability improvements. This release includes significant fixes for timeline auto-scroll behavior, conversation button primitive refactoring, and visitor blocking support. Dashboard improvements include redesigned contact pages, better timeline animations, and visitor blocking UI indicators.
- 28bb8e9: Test release v0.0.3 to verify automated GitHub release workflow
  - @cossistant/core@0.0.4
  - @cossistant/types@0.0.4

## 0.0.3

### Patch Changes

- Test release v0.0.3 to verify automated GitHub release workflow
- cb3b12b: Test release to verify automated release workflow

  This is a test release to confirm the automated GitHub release workflow is working correctly.
  - @cossistant/core@0.0.3
  - @cossistant/types@0.0.3

## 0.0.2

### Patch Changes

- 8af65ed: Initial public release of Cossistant React and Next.js SDKs

  This is the first public release of our headless React SDK and Next.js adapter for building AI-powered support and chat widgets.

  **Core Features:**
  - Headless React hooks and primitives for maximum flexibility
  - WebSocket-driven real-time communication
  - TypeScript-first with full type safety
  - Pre-built support widget components with Tailwind styling
  - Conversation management and message handling
  - Visitor presence tracking and typing indicators
  - File upload support with drag-and-drop
  - Markdown message rendering
  - Accessibility-focused (WCAG compliance)

  **React Package (`@cossistant/react`):**
  - Core hooks: `useConversation`, `useMessages`, `usePresence`
  - Headless primitives for custom UI implementation
  - Pre-built support widget components
  - Real-time event system
  - Utilities for message formatting and validation

  **Next.js Package (`@cossistant/next`):**
  - Next.js-optimized hooks and components
  - Server-side rendering support
  - App Router compatibility
  - Simplified setup for Next.js projects

- Test release to verify automated release workflow

  This is a test release to confirm the automated GitHub release workflow is working correctly.
  - @cossistant/core@0.0.2
  - @cossistant/types@0.0.2

## 0.0.1

### Patch Changes

- Initial public release of Cossistant React and Next.js SDKs

  This is the first public release of our headless React SDK and Next.js adapter for building AI-powered support and chat widgets.

  **Core Features:**
  - Headless React hooks and primitives for maximum flexibility
  - WebSocket-driven real-time communication
  - TypeScript-first with full type safety
  - Pre-built support widget components with Tailwind styling
  - Conversation management and message handling
  - Visitor presence tracking and typing indicators
  - File upload support with drag-and-drop
  - Markdown message rendering
  - Accessibility-focused (WCAG compliance)

  **React Package (`@cossistant/react`):**
  - Core hooks: `useConversation`, `useMessages`, `usePresence`
  - Headless primitives for custom UI implementation
  - Pre-built support widget components
  - Real-time event system
  - Utilities for message formatting and validation

  **Next.js Package (`@cossistant/next`):**
  - Next.js-optimized hooks and components
  - Server-side rendering support
  - App Router compatibility
  - Simplified setup for Next.js projects

- Updated dependencies []:
  - @cossistant/core@0.0.1
  - @cossistant/types@0.0.1
