# Tierlist JSON Schema Documentation

This document describes the structure of tierlist JSON files used by the application.

## Overview

Tierlist JSON files contain a complete tierlist configuration including:
- Title of the tierlist
- Tier rows (S, A, B, C, etc.) with their items
- Untiered items (items not yet placed in any tier)

## Root Object Structure

```json
{
  "title": string,
  "rows": array<TierRow>,
  "untiered": array<Item> (optional)
}
```

### Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `title` | `string` | Yes | The title/name of the tierlist |
| `rows` | `array<TierRow>` | Yes | Array of tier rows (S, A, B, C, etc.) |
| `untiered` | `array<Item>` | No | Array of items not yet placed in any tier |

## TierRow Object

Represents a single tier row (e.g., "S", "A", "B").

```json
{
  "name": string,
  "color": string,
  "imgs": array<Item>
}
```

### Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `string` | Yes | The tier name (e.g., "S", "A", "B", "C") |
| `color` | `string` | Yes | Hex color code for the tier header (e.g., "#ff6666") |
| `imgs` | `array<Item>` | Yes | Array of items in this tier (can be empty `[]`) |

## Item Object

Represents a single item (restaurant/food item) in the tierlist.

### Current Format (Recommended)

```json
{
  "src": string,
  "name": string
}
```

### Legacy Format (Deprecated but supported)

For backward compatibility, items in `rows[].imgs` can also be just a string:

```json
"data:image/webp;base64,..."
```

The application automatically handles both formats.

### Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `src` | `string` | Yes | Data URI of the image in format: `data:image/{format};base64,{base64_data}` |
| `name` | `string` | Yes | Display name of the item (restaurant name, food item name, etc.) |

### Image Source Format

The `src` field uses Data URI format:
```
data:image/{format};base64,{base64_encoded_image_data}
```

Supported formats:
- `image/webp` (recommended)
- `image/png`
- `image/jpeg`
- `image/gif`

Example:
```json
{
  "src": "data:image/webp;base64,iVBORw0KGgoAAAANSUhEUgAA...",
  "name": "Pizza Palace"
}
```

## Complete Example

```json
{
  "title": "Yerevan Restaurants Tier List",
  "rows": [
    {
      "name": "S",
      "color": "#ff6666",
      "imgs": [
        {
          "src": "data:image/webp;base64,iVBORw0KGgoAAAANSUhEUgAA...",
          "name": "Bogicheski"
        },
        {
          "src": "data:image/webp;base64,iVBORw0KGgoAAAANSUhEUgAA...",
          "name": "Pizdec Hamov"
        }
      ]
    },
    {
      "name": "A",
      "color": "#f0a731",
      "imgs": [
        {
          "src": "data:image/webp;base64,iVBORw0KGgoAAAANSUhEUgAA...",
          "name": "Lavikna"
        }
      ]
    }
  ],
  "untiered": [
    {
      "src": "data:image/webp;base64,iVBORw0KGgoAAAANSUhEUgAA...",
      "name": "New Restaurant"
    }
  ]
}
```

## File Size Considerations

- **Large files**: Tierlist JSON files can be very large (70MB+) due to base64-encoded images
- **Memory usage**: Loading the entire file into memory requires significant RAM
- **Optimization**: For append operations, consider:
  - Streaming JSON parsers (requires external libraries)
  - Incremental updates
  - Database storage for very large datasets

## Validation Rules

1. `title` must be a non-empty string
2. `rows` must be an array (can be empty)
3. Each `TierRow` must have `name`, `color`, and `imgs`
4. `color` must be a valid hex color code (e.g., "#ff6666")
5. Each `Item` must have `src` and `name`
6. `src` must be a valid data URI starting with `data:image/`
7. `untiered` is optional but recommended to be an array if present

## Usage in Application

The application (`tiers.js`) handles:
- Loading tierlists from JSON files
- Saving tierlists to JSON files
- Importing from remote URLs via query parameter: `?url=path/to/file.json`
- Backward compatibility with legacy string-only item format

## Notes for Developers

- Always validate JSON structure before parsing
- Handle both new and legacy item formats
- Consider memory constraints when working with large files
- Use streaming parsers for files > 100MB if possible
- The `untiered` array is where new items are typically added
