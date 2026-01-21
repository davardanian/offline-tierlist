# Utility Scripts

This folder contains utility scripts for managing the tierlist data.

## add_restaurant.js

Adds a new restaurant to the untiered list in a JSON tierlist file.

### Usage

```bash
node util/add_restaurant.js
```

Or if the script is executable:

```bash
./util/add_restaurant.js
```

### What it does

1. Lists all JSON files in the `data/` folder
2. Prompts you to select which file to modify
3. Asks for the restaurant name
4. Asks for the image URL
5. Downloads the image from the URL
6. Converts it to base64 format (matching the tierlist format)
7. Appends the new restaurant to the `untiered` array
8. Saves the updated JSON file

### Requirements

- Node.js (uses built-in modules only, no npm packages required)
- Internet connection (to download images from URLs)

### Example

```bash
$ node util/add_restaurant.js
=== Add Restaurant to Tierlist ===

Available JSON files:
  1. restaurant_template.json
  2. restaurant_tierlist.json

Select a file (1-2): 2

Selected: restaurant_tierlist.json

Enter restaurant name: Pizza Palace
Enter image URL: https://example.com/pizza-logo.png

Loading JSON file...
Downloading image...
Image downloaded and converted successfully!
Saving to file...

✓ Successfully added "Pizza Palace" to restaurant_tierlist.json
  Total untiered items: 725
```

### Supported Image Formats

The script automatically detects and supports:
- WebP (`image/webp`)
- JPEG/JPG (`image/jpeg`)
- PNG (`image/png`)
- GIF (`image/gif`)

The format is determined from the HTTP response content-type header, or inferred from the URL extension if the header is missing.
