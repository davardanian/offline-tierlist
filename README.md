### Offline Tierlist Maker

This is a simple webpage that allows creating custom "[Tierlists](https://knowyourmeme.com/memes/tier-lists)".

You can play with the latest version at [silverweed.github.io/tiers](https://silverweed.github.io/tiers), or you can download the repository and open `index.html` in your browser (in both cases, all the logic is run locally on your browser).

#### Features
- Give a title to your tierlist
- Import any number of pictures from your local disk
- Customize the tier names
- Customize the number of tiers
- **Item names displayed below pictures**: Restaurant/item names are shown below each image in both the untiered section and in the tier rows, making it easier to identify items at a glance.
- Export your tierlist as JSON and reimport it even from another PC (image data is embedded in the save file). Please consider that this tierlist maker currently does NOT rescale or process the images in any way, so the save file's size will strongly depend on how large are your input images. Avoid uploading too many huge images or the whole app may slow down. In the future I may add thumbnailing capabilities, but for now I'd rather keep it simple. 
- Import back your tierlist from JSON, either by manually loading it through the Import button or from a remote file. To import a remote tierlist file, use the query parameter `?url=http://url/of/your_tierlist.json` (to avoid issues with special characters in the URL it's advisable to [URL-encode](https://www.urlencoder.io/) it).

#### Yerevan Restaurants Data

This repository includes a pre-populated tierlist with **724 unique restaurants from Yerevan, Armenia**, collected from Glovo and buy.am delivery platforms. The data is available in `restaurant_tierlist.json` and includes:

- Restaurant logos (embedded as base64-encoded images)
- Restaurant names displayed below each logo
- All restaurants ready to be organized into tiers

To use the Yerevan restaurants data:
1. Open `index.html` in your browser
2. Click the Import button
3. Select `restaurant_tierlist.json`

Or import directly via URL: `index.html?url=restaurant_tierlist.json`
