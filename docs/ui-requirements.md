# UI Requirements

## Design Intent

The platform has two distinct user experiences:

- Player experience: mobile-first, fast, simple, touch-friendly.
- Admin experience: responsive, data-dense, efficient on laptop/desktop.

The future microfrontend implementation should treat these as separate UX modes, even if they share components and API clients.

## Player Experience

### Primary device

- Smartphones are the default device.
- UI must work well on small screens first.
- Landscape mode is optional, portrait mode is primary.

### Key player journeys

- Open join link from Teams, WhatsApp, SMS, or browser.
- Scan QR code and land directly in a join flow.
- Join a game quickly with minimal typing.
- See personal score/progress quickly.
- View current leaderboard without navigating complex menus.

### Mobile UX requirements

- Large tap targets.
- One-hand usage should be practical.
- Minimal form fields for joining.
- Avoid data-heavy tables on player screens.
- Use cards, stacked sections, and large status blocks instead of desktop tables.
- Key actions should be visible without deep navigation.
- Avoid requiring login for join/play actions.
- Login should only appear when player wants to track personal progress across sessions.

### Performance expectations

- Fast initial load on mobile networks.
- Minimize API round-trips on first player screen.
- Prefer compact views over large data grids.
- Avoid excessive client-side state complexity in player flows.

## Admin Experience

### Primary device

- Laptop/desktop is the default admin device.
- Tablet support is useful, but not the primary target.

### Key admin journeys

- Create and manage events.
- Configure locations and games.
- Generate join links and QR codes.
- Enter or manage scores.
- Monitor leaderboards across game, location, and event scopes.

### Admin UX requirements

- Use data-dense layouts where appropriate.
- Tables are acceptable for admin views.
- Multi-column layouts are acceptable on larger screens.
- Forms should support efficient repeated data entry.
- Navigation should separate setup, operations, and reporting clearly.

## Responsive Behavior

### Player screens

- Default to single-column layouts.
- Avoid sidebars on mobile.
- Prefer bottom actions, sticky CTAs, and simple headers.

### Admin screens

- Support larger layouts with side navigation on wider screens.
- Collapse to stacked sections on smaller widths.
- Preserve usability on medium screens without requiring horizontal scrolling for core tasks.

## Accessibility

- Sufficient color contrast.
- Touch-friendly input spacing.
- Clear labels for scores, rank, event, location, and game.
- Avoid relying only on color to communicate status.

## Suggested Frontend Information Architecture

### Player app sections

- Join game
- My progress
- Leaderboard

### Admin app sections

- Events
- Locations
- Games
- Event game setup
- Join links and QR codes
- Score operations
- Reports and leaderboards

## API Implications For Frontend

The current API is aligned with these UI needs:

- Public join endpoint for guest player participation.
- QR and join-link generation endpoint for admin workflows.
- Player-authenticated progress endpoint for optional account-based tracking.
- Separate leaderboard scopes for player and admin views.

## Future Frontend Recommendation

- Build the player shell as a mobile-first microfrontend.
- Build the admin shell as a responsive management microfrontend.
- Share API client libraries and design tokens, but not necessarily the same page layouts.