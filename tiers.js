/*
	Offline Tierlist Maker
	Copyright (C) 2022  silverweed

 Everyone is permitted to copy and distribute verbatim or modified
 copies of this license document, and changing it is allowed as long
 as the name is changed.

            DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE
   TERMS AND CONDITIONS FOR COPYING, DISTRIBUTION AND MODIFICATION

  0. You just DO WHAT THE FUCK YOU WANT TO.
*/

'use strict';

const MAX_NAME_LEN = 200;
const DEFAULT_TIERS = ['S','A','B','C','D','E','F'];
const TIER_COLORS = [
	// from S to F
	'#ff6666',
	'#f0a731',
	'#f4d95b',
	'#66ff66',
	'#58c8f4',
	'#5b76f4',
	'#f45bed'
];

let unique_id = 0;

let unsaved_changes = false;

const LAYOUT_HORIZONTAL = 0;
const LAYOUT_VERTICAL = 1;
let cur_layout = LAYOUT_HORIZONTAL;

// Contains [[header, input, label]]
let all_headers = [];
let headers_orig_min_width;

// DOM elems
let untiered_images;
let tierlist_div;
let dragged_image;

// Used in drop() logic for placing items within a tier
let old_item_index;

// Used to add and remove the placement marker
let placement_marker_div;

function reset_row(row) {
	row.querySelectorAll('span.item').forEach((item) => {
		// Find item-container or img within the item
		let item_container = item.querySelector('.item-container');
		if (!item_container) {
			// Fallback: look for img directly (old format)
			item_container = item.querySelector('img.draggable');
		}
		if (item_container) {
			item.removeChild(item_container);
			untiered_images.appendChild(item_container);
		}
		item.parentNode.removeChild(item);
	});
}

// Removes all rows from the tierlist, alongside their content.
// Also empties the untiered images.
function hard_reset_list() {
	tierlist_div.innerHTML = '';
	untiered_images.innerHTML = '';
}

// Places back all the tierlist content into the untiered pool.
function soft_reset_list() {
	tierlist_div.querySelectorAll('.row').forEach(reset_row);
	unsaved_changes = true;
}

window.addEventListener('load', () => {
	untiered_images =  document.querySelector('.images');
	tierlist_div =  document.querySelector('.tierlist');

	for (let i = 0; i < DEFAULT_TIERS.length; ++i) {
		add_row(i, DEFAULT_TIERS[i]);
	}
	recompute_header_colors();

	headers_orig_min_width = all_headers[0][0].clientWidth;

	make_accept_drop(document.querySelector('.images'));

	bind_title_events();

	document.getElementById('load-img-input').addEventListener('input', (evt) => {
		// @Speed: maybe we can do some async stuff to optimize this
		let images = document.querySelector('.images');
		for (let file of evt.target.files) {
			let reader = new FileReader();
			reader.addEventListener('load', (load_evt) => {
				// Extract name from filename (remove extension)
				let name = file.name.replace(/\.[^/.]+$/, '');
				let item_container = create_item_with_src_and_name(load_evt.target.result, name);
				images.appendChild(item_container);
				unsaved_changes = true;
			});
			reader.readAsDataURL(file);
		}
	});

	// Allow copy-pasting image from clipboard
	document.onpaste = (evt) => {
		let clip_data = evt.clipboardData || evt.originalEvent.clipboardData;
		let items = clip_data.items;
		let images = document.querySelector('.images');
		for (let item of items) {
			if (item.kind === 'file') {
				let blob = item.getAsFile();
				let reader = new FileReader();
				reader.onload = (load_evt) => {
					// Pasted images don't have names, use empty string
					let item_container = create_item_with_src_and_name(load_evt.target.result, '');
					images.appendChild(item_container);
					unsaved_changes = true;
				};
				reader.readAsDataURL(blob);
			}
		}
	};

	document.getElementById('reset-list-input').addEventListener('click', () => {
		if (confirm('Reset Tierlist? (this will place all images back in the pool)')) {
			soft_reset_list();
		}
	});

	document.getElementById('export-input').addEventListener('click', () => {
		let name = prompt('Please give a name to this tierlist');
		if (name) {
			save_tierlist(`${name}.json`);
		}
	});

	document.getElementById('import-input').addEventListener('input', (evt) => {
		if (!evt.target.files) {
			return;
		}
		let file = evt.target.files[0];
		let reader = new FileReader();
		reader.addEventListener('load', (load_evt) => {
			let raw = load_evt.target.result;
			let parsed = JSON.parse(raw);
			if (!parsed) {
				alert("Failed to parse data");
				return;
			}
			hard_reset_list();
			load_tierlist(parsed);
		});
		reader.readAsText(file);
	});

	bind_trash_events();
	bind_toggle_layout_events();

	window.addEventListener('beforeunload', (evt) => {
		if (!unsaved_changes) return null;
		var msg = "You have unsaved changes. Leave anyway?";
		(evt || window.event).returnValue = msg;
		return msg;
	});

	void try_load_tierlist_json();
});

function create_img_with_src(src) {
	let img = document.createElement('img');
	img.src = src;
	img.style.userSelect = 'none';
	img.classList.add('draggable');
	img.draggable = true;
	img.ondragstart = "event.dataTransfer.setData('text/plain', null)";
	img.addEventListener('mousedown', (evt) => {
		dragged_image = evt.target;
		dragged_image.classList.add("dragged");

	    // Grabs the index of the item's original placement prior to being dragged.
		old_item_index = get_item_index(dragged_image)
	});
	return img;
}

function create_item_with_src_and_name(src, name) {
	// Create container for image and label
	let container = document.createElement('div');
	container.classList.add('item-container');
	
	// Create image
	let img = document.createElement('img');
	img.src = src;
	img.style.userSelect = 'none';
	img.classList.add('draggable');
	img.draggable = true;
	img.ondragstart = "event.dataTransfer.setData('text/plain', null)";
	
	// Create label for restaurant name
	let label = document.createElement('span');
	label.classList.add('item-label');
	label.textContent = name || '';
	label.style.userSelect = 'none';
	
	// Add mousedown handler to the image for dragging
	img.addEventListener('mousedown', (evt) => {
		// Find the item container (could be direct parent or grandparent)
		let itemContainer = evt.target.closest('.item-container');
		if (!itemContainer) {
			itemContainer = container;
		}
		dragged_image = itemContainer;
		dragged_image.classList.add("dragged");

		// Grabs the index of the item's original placement prior to being dragged.
		old_item_index = get_item_index(itemContainer);
	});
	
	container.appendChild(img);
	container.appendChild(label);
	
	return container;
}

function save(filename, text) {
	unsaved_changes = false;

	var el = document.createElement('a');
	el.setAttribute('href', 'data:text/html;charset=utf-8,' + encodeURIComponent(text));
	el.setAttribute('download', filename);
	el.style.display = 'none';
	document.body.appendChild(el);
	el.click();
	document.body.removeChild(el);
}

function save_tierlist(filename) {
	let serialized_tierlist = {
		title: document.querySelector('.title-label').innerText,
		rows: [],
	};
	tierlist_div.querySelectorAll('.row').forEach((row, i) => {
		// Converts and saves the header background color as hex for easy import later.
		let header = row.querySelector('.header');
		let r_value = header.style.backgroundColor.replace(/[^\d,]/g, '').split(',')[0];
		let g_value = header.style.backgroundColor.replace(/[^\d,]/g, '').split(',')[1];
		let b_value = header.style.backgroundColor.replace(/[^\d,]/g, '').split(',')[2];
		let color_hex = rgb_to_hex(r_value, g_value, b_value);

		serialized_tierlist.rows.push({
			name: row.querySelector('.header label').innerText.substr(0, MAX_NAME_LEN),
			color: color_hex
		});
		serialized_tierlist.rows[i].imgs = [];
		// Look for item-containers first (new format), then fall back to img elements (old format)
		row.querySelectorAll('.item-container').forEach((container) => {
			let img = container.querySelector('img.draggable');
			let label = container.querySelector('.item-label');
			if (img) {
				serialized_tierlist.rows[i].imgs.push({
					src: img.src,
					name: label ? label.textContent.trim() : ''
				});
			}
		});
		// Fallback: if no item-containers found, use old format (bare img elements)
		if (serialized_tierlist.rows[i].imgs.length === 0) {
			row.querySelectorAll('img.draggable').forEach((img) => {
				serialized_tierlist.rows[i].imgs.push(img.src);
			});
		}
	});

	let untiered_imgs = document.querySelectorAll('.images .item-container, .images img.draggable');
	if (untiered_imgs.length > 0) {
		serialized_tierlist.untiered = [];
		untiered_imgs.forEach((elem) => {
			// Check if it's an item-container (new format) or img (old format)
			if (elem.classList && elem.classList.contains('item-container')) {
				let img = elem.querySelector('img.draggable');
				let label = elem.querySelector('.item-label');
				if (img) {
					serialized_tierlist.untiered.push({
						src: img.src,
						name: label ? label.textContent.trim() : ''
					});
				}
			} else if (elem.tagName && elem.tagName.toUpperCase() === 'IMG') {
				// Old format - just the image src
				serialized_tierlist.untiered.push(elem.src);
			}
		});
	}

	save(filename, JSON.stringify(serialized_tierlist));
}

function load_tierlist(serialized_tierlist) {
	document.querySelector('.title-label').innerText = serialized_tierlist.title;
	for (let idx in serialized_tierlist.rows) {
		let ser_row = serialized_tierlist.rows[idx];
		let elem = add_row(idx, ser_row.name);

		for (let img_data of ser_row.imgs ?? []) {
			// Handle both old format (string) and new format (object with src and name)
			let img_src, img_name;
			if (typeof img_data === 'string') {
				// Old format - just the image src
				img_src = img_data;
				img_name = '';
			} else if (typeof img_data === 'object' && img_data.src) {
				// New format - object with src and name
				img_src = img_data.src;
				img_name = img_data.name || '';
			} else {
				continue; // Skip invalid entries
			}
			
			let item_container = create_item_with_src_and_name(img_src, img_name);
			let td = document.createElement('span');
			td.classList.add('item');
			td.appendChild(item_container);
			let items_container = elem.querySelector('.items');
			items_container.appendChild(td);
		}

		elem.querySelector('label').innerText = ser_row.name;
		// If "color" keys are found in the json, use them for the row header coloring.
		if (ser_row.color !== undefined) {
			let header = elem.querySelector('.header');
			header.style.backgroundColor = ser_row.color;
			header.querySelector('.row-color-picker').value = ser_row.color;
		} else {
			recompute_header_colors();
		}
	}

	if (serialized_tierlist.untiered) {
		let images = document.querySelector('.images');
		for (let img_data of serialized_tierlist.untiered) {
			// Handle both old format (string) and new format (object with src and name)
			let img_src, img_name;
			if (typeof img_data === 'string') {
				// Old format - just the image src
				img_src = img_data;
				img_name = '';
			} else if (typeof img_data === 'object' && img_data.src) {
				// New format - object with src and name
				img_src = img_data.src;
				img_name = img_data.name || '';
			} else {
				continue; // Skip invalid entries
			}
			
			let item_container = create_item_with_src_and_name(img_src, img_name);
			images.appendChild(item_container);
		}
	}

	resize_headers();

	unsaved_changes = false;
}

function rgb_to_hex(r, g, b) {
	return "#" + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1);
}

// Returns the supplied item's index within a row
// elem can be an img, item-container, or item span
function get_item_index(elem) {
	// If it's an item-container, find the containing item span
	let item_elem = elem;
	if (elem.classList && elem.classList.contains('item-container')) {
		item_elem = elem.closest('.item') || elem.parentNode;
	} else if (elem.tagName && elem.tagName.toUpperCase() === 'IMG') {
		// If it's an img, find the item-container or item span
		item_elem = elem.closest('.item-container') || elem.closest('.item') || elem.parentNode;
	}
	
	let rows = Array.from(tierlist_div.querySelectorAll(".row"));
	let parent_div = item_elem.parentNode;
	while (parent_div && !parent_div.classList.contains('row') && !parent_div.classList.contains('bottom-container') && !parent_div.classList.contains('toggleable-container')) {
		parent_div = parent_div.parentNode;
	}
	
	if (!parent_div) return null;
	
	let idx = rows.indexOf(parent_div);
	if (rows[idx] !== undefined) {
		// Look for item-containers first, then fall back to img elements
		let item_list = rows[idx].querySelectorAll(".item-container, .item > img, .item img");
		for (let i = 0; i < item_list.length; i++) {
			if (item_list[i] == elem || item_list[i].contains(elem) || (elem.classList && elem.classList.contains('item-container') && item_list[i] == elem)) {
				return i;
			}
		}
		// Fallback: check item spans
		let item_spans = rows[idx].querySelectorAll(".item");
		for (let i = 0; i < item_spans.length; i++) {
			if (item_spans[i] == item_elem || item_spans[i].contains(elem)) {
				return i;
			}
		}
	}
	// Bottom images container
	// Note: images manipulated in the bottom container will have a different parent div after being moved
	// This accounts for both cases
	else if (parent_div.classList.contains("bottom-container") || parent_div.classList.contains("toggleable-container")) {
		// Look for item-containers first, then fall back to img elements
		let item_list = parent_div.querySelectorAll(".item-container, img.draggable");
		for (let i = 0; i < item_list.length; i++) {
			if (item_list[i] == elem || item_list[i].contains(elem) || (elem.tagName && elem.tagName.toUpperCase() === 'IMG' && item_list[i].querySelector('img') == elem)) {
				// '-4' accounts for the four images in the buttons-container
				// required as part of the parent div changing for moved items
				return i - 4;
			}
		}
	}
	return null;
}

// Sets the item placement marker render location
function set_item_placement_marker_location(elem, is_hovering_row) {
	var h_offset = elem.offsetLeft.toString();
	let hovering_empty_bottom_container = false;

	// Hovering an empty bottom container
	// A normal row and the bottom-container have different marginLeft's
	// This ensures the marker appears correctly on an empty bottom-container
	if (elem.parentNode.classList.contains("bottom-container")) {
		hovering_empty_bottom_container = true;
	}

	// There is an 8px left margin offset before the tier begins (the blank gap)
	// This subtraction accounts for that
	h_offset -= 8;

	if (is_hovering_row && !hovering_empty_bottom_container){
		// Moves the vertical line to the right
		let position_info;
		let row_header = elem.getElementsByClassName("header");
		row_header = row_header[0];
		if (row_header !== undefined) {
			// Hovering the row-droppable div
			position_info = row_header.getBoundingClientRect();
		} else {
			// Hovering the row header or header label
			position_info = elem.getBoundingClientRect();
		}

		h_offset = position_info.right - 8;
		placement_marker_div.style.marginLeft = h_offset + "px";
	} else {
		placement_marker_div.style.marginLeft = h_offset + "px";
	}

	placement_marker_div.style.top = `${elem.offsetTop}px`;
}

function pre_calc_row_item_placement_marker_location(image_node_list, drag_enter_img) {
	let last_image = image_node_list[image_node_list.length - 1];
	
	if (last_image !== undefined) {
		// Rows has items
		// If it's an item-container, get the img element for positioning
		let elem_for_positioning = last_image;
		if (last_image.classList && last_image.classList.contains('item-container')) {
			elem_for_positioning = last_image.querySelector('img.draggable') || last_image;
		}
		set_item_placement_marker_location(elem_for_positioning, true);
	}
	else {
		// Row is empty
		set_item_placement_marker_location(drag_enter_img, true);
	}
}

function end_drag(evt) {
	// Remove the placement marker after valid and invalid drop
	if (placement_marker_div.parentNode === document.body) {
		document.body.removeChild(placement_marker_div);
	}
	dragged_image?.classList.remove("dragged");
	dragged_image = null;
}

window.addEventListener('mouseup', end_drag);
window.addEventListener('dragend', end_drag);

function make_accept_drop(elem) {
	elem.classList.add('droppable');

  	let target_item_index;
  	let drag_enter_img;

	// Used to add and remove the placement marker
	placement_marker_div = document.createElement('div');
	placement_marker_div.classList.add("vl");

	elem.addEventListener('dragenter', (evt) => {
		drag_enter_img = evt.target;
		drag_enter_img.classList.add('drag-entered');
		
		// Find the actual element to use for index calculation
		// Could be item-container, img, item-label, or item span
		let target_elem = drag_enter_img;
		if (drag_enter_img.classList && drag_enter_img.classList.contains('item-label')) {
			// If hovering over label, use the container
			target_elem = drag_enter_img.closest('.item-container') || drag_enter_img.parentNode;
		} else if (drag_enter_img.tagName && drag_enter_img.tagName.toUpperCase() === 'IMG' && !drag_enter_img.classList.contains('draggable')) {
			// Non-draggable img (like button icons), skip
			return;
		}
		
		// Grabs the index of the item that the dragged item is hovering.
		// Used for placing items within the row
		target_item_index = get_item_index(target_elem);

		// Hovering a row
		if (drag_enter_img.classList.contains("row") || drag_enter_img.classList.contains("images")){
			let image_node_list = drag_enter_img.querySelectorAll("img.draggable, .item-container");

			pre_calc_row_item_placement_marker_location(image_node_list, drag_enter_img);
		}
		// Hovering a row label or header
		else if (drag_enter_img.parentNode && drag_enter_img.parentNode.classList.contains("row")){
			let image_node_list = drag_enter_img.parentNode.querySelectorAll("img.draggable, .item-container");

			pre_calc_row_item_placement_marker_location(image_node_list, drag_enter_img);
		}
		// Hovering an item (image or container)
		else if (drag_enter_img.classList.contains("draggable") || drag_enter_img.classList.contains("item-container") || drag_enter_img.classList.contains("item-label")) {
			// Find the element for placement marker (prefer img, but container works too)
			let elem_for_positioning = drag_enter_img;
			if (drag_enter_img.classList.contains("item-container")) {
				elem_for_positioning = drag_enter_img.querySelector("img.draggable") || drag_enter_img;
			} else if (drag_enter_img.classList.contains("item-label")) {
				elem_for_positioning = drag_enter_img.parentNode.querySelector("img.draggable") || drag_enter_img.parentNode;
			}
			set_item_placement_marker_location(elem_for_positioning, false);
		}

		document.body.appendChild(placement_marker_div);
	});

	elem.addEventListener('dragleave', (evt) => {
		evt.target.classList.remove('drag-entered');
	});

	elem.addEventListener('dragover', (evt) => {
		evt.preventDefault();
	});

	elem.addEventListener('drop', (evt) => {
		evt.preventDefault();
		evt.target.classList.remove('drag-entered');

		if (!dragged_image) {
			return;
		}

		let old_item_row;
		let item_to_move = dragged_image;

		// Find the item container if dragged_image is an img
		if (dragged_image.tagName && dragged_image.tagName.toUpperCase() === 'IMG') {
			item_to_move = dragged_image.closest('.item-container') || dragged_image.closest('.item') || dragged_image;
		}

		let dragged_image_parent = item_to_move.parentNode;
		
		// Check if it's already wrapped in an item span
		if (dragged_image_parent.tagName.toUpperCase() === 'SPAN' &&
				dragged_image_parent.classList.contains('item')) {
			// We were already in a tier
			let containing_tr = dragged_image_parent.parentNode;

			// This is the same as setting the variable at the start of the grab
			old_item_row = containing_tr.parentNode;

			containing_tr.removeChild(dragged_image_parent);
			item_to_move = dragged_image_parent; // Use the item span
		} else {
			// Remove from current location
			dragged_image_parent.removeChild(item_to_move);
		}
		
		// If item_to_move is not already an item span, wrap it
		let td;
		if (item_to_move.classList && item_to_move.classList.contains('item')) {
			td = item_to_move;
		} else {
			td = document.createElement('span');
			td.classList.add('item');
			td.appendChild(item_to_move);
		}
		
		let items_container = elem.querySelector('.items');
		if (!items_container) {
			// Quite lazy hack for <section class='images'>
			items_container = elem;
		}
		
		// Checks if the item is moving within the same row
		// Used as a fix along with target_item_index to ensure the item is placed to the left of the target
		// For example: Without this, on the same row, moving an item from index 2 -> 5 will place the item
		// to the right of the image (target item). This will ensure the image will always be to the left
		// of the target.
		if (items_container.parentNode === old_item_row && old_item_index < target_item_index){
			// Same row
			target_item_index = target_item_index - 1;
		}
	
		// Dragged onto the row
		// Appends the item instead of using the index
		if (evt.target.classList.contains("row")) {
			// This is a row
			items_container.appendChild(td);
		} else {
			items_container.insertBefore(td, items_container.children[target_item_index]);
		}

		unsaved_changes = true;
	});
}

function enable_edit_on_click(container, input, label, row_color_input) {
	function change_label(evt) {
		input.style.display = 'none';
		label.innerText = input.value;
		label.style.display = 'inline';

		// Prevents exception when this function is called for the title, and not a row
		if (row_color_input !== undefined) {
			container.style.backgroundColor = row_color_input.value;
			row_color_input.style.display = "none";
		}

		unsaved_changes = true;
	}

	// Close the header and apply header edits if the row is open.
	let evt_timestamp;
	container.addEventListener('focusout', (evt) => {
		if (evt.target.classList.value !== "row-color-picker" && evt.relatedTarget !== null) {
			if (evt.relatedTarget.classList.value === "row-color-picker") {
				// Do nothing
				label.innerText = input.value;
				evt_timestamp = evt.timeStamp;
			};
		// Grace period is 200 milliseconds
		// Required for Firefox as a focusout event exemption
		// When opening the color picker, an additional focusout event is called
		// This filters out the event so the header isn't closed
		} else if (evt.timeStamp <= evt_timestamp + 200) {
			// Do nothing
		} else {
			change_label();
		}
	});

	container.addEventListener('click', (evt) => {
		// Close the header and apply header edits if the header is open.
		// Only occurs when the header, is selected.
		if (evt.target.classList.value === "header" && input.style.display === 'inline') {
			change_label();
		} else {
			label.style.display = 'none';
			input.value = label.innerText.substr(0, MAX_NAME_LEN);
			input.style.display = 'inline';
			input.style.textAlign = "center";
			input.select();
		
			// Prevents exception when this function is called for the title, and not a row
			if (row_color_input !== undefined) {
				row_color_input.style.display = 'inline';
			}
		}
	});
}

function bind_title_events() {
	let title_label = document.querySelector('.title-label');
	let title_input = document.getElementById('title-input');
	let title = document.querySelector('.title');

	enable_edit_on_click(title, title_input, title_label);
}

function create_label_input(row, row_idx, row_name) {
	let input = document.createElement('input');
	input.id = `input-tier-${unique_id++}`;
	input.type = 'text';
	input.addEventListener('change', resize_headers);
	let label = document.createElement('label');
	label.htmlFor = input.id;
	label.innerText = row_name;

	let header = row.querySelector('.header');
	all_headers.splice(row_idx, 0, [header, input, label]);
	header.appendChild(label);
	header.appendChild(input);

	let row_color_input = document.createElement('input');
	row_color_input.type = "color";
	row_color_input.classList.add('row-color-picker');
	row_color_input.value = TIER_COLORS[row_idx % TIER_COLORS.length];
	row_color_input.style.padding = "0px";
	row_color_input.style.width = "100px";
	row_color_input.style.height = "100px";
	row_color_input.style.display = "none";
	header.appendChild(row_color_input);

	enable_edit_on_click(header, input, label, row_color_input);
}

function resize_headers() {
	let max_width = headers_orig_min_width;
	for (let [other_header, _i, label] of all_headers) {
		max_width = Math.max(max_width, label.clientWidth);
	}

	for (let [other_header, _i2, _l2] of all_headers) {
		other_header.style.minWidth = `${max_width}px`;
	}
}

function add_row(index, name) {
	let div = document.createElement('div');
	let header = document.createElement('span');
	let items = document.createElement('span');
	div.classList.add('row');
	header.classList.add('header');
	items.classList.add('items');
	div.appendChild(header);
	div.appendChild(items);
	let row_buttons = document.createElement('div');
	row_buttons.classList.add('row-buttons');
	let btn_plus_up = document.createElement('input');
	btn_plus_up.type = "button";
	btn_plus_up.value = '+';
	btn_plus_up.title = "Add row above";
	btn_plus_up.addEventListener('click', (evt) => {
		let parent_div = evt.target.parentNode.parentNode;
		let rows = Array.from(tierlist_div.children);
		let idx = rows.indexOf(parent_div);
		console.assert(idx >= 0);
		add_row(idx, '');
		recompute_header_colors(idx);
	});
	let btn_rm = document.createElement('input');
	btn_rm.type = "button";
	btn_rm.value = '-';
	btn_rm.title = "Remove row";
	btn_rm.addEventListener('click', (evt) => {
		let rows = Array.from(tierlist_div.querySelectorAll('.row'));
		if (rows.length < 2) return;
		let parent_div = evt.target.parentNode.parentNode;
		let idx = rows.indexOf(parent_div);
		console.assert(idx >= 0);
		if (rows[idx].querySelectorAll('img').length === 0 ||
			confirm(`Remove tier ${rows[idx].querySelector('.header label').innerText}? (This will move back all its content to the untiered pool)`))
		{
			rm_row(idx);
		}
	});
	let btn_plus_down = document.createElement('input');
	btn_plus_down.type = "button";
	btn_plus_down.value = '+';
	btn_plus_down.title = "Add row below";
	btn_plus_down.addEventListener('click', (evt) => {
		let parent_div = evt.target.parentNode.parentNode;
		let rows = Array.from(tierlist_div.children);
		let idx = rows.indexOf(parent_div);
		console.assert(idx >= 0);
		add_row(idx + 1, name);
		recompute_header_colors(idx + 1);
	});
	row_buttons.appendChild(btn_plus_up);
	row_buttons.appendChild(btn_rm);
	row_buttons.appendChild(btn_plus_down);
	div.appendChild(row_buttons);

	let rows = tierlist_div.children;
	if (index === rows.length) {
		tierlist_div.appendChild(div);
	} else {
		let nxt_child = rows[index];
		tierlist_div.insertBefore(div, nxt_child);
	}

	make_accept_drop(div);
	create_label_input(div, index, name);

	return div;
}

function rm_row(idx) {
	let row = tierlist_div.children[idx];
	reset_row(row);
	tierlist_div.removeChild(row);
}

function recompute_header_colors(idx) {
	// Computes the colors for the supplied row index, or if undefined, all the row headers.
	if (idx === undefined) {
		tierlist_div.querySelectorAll('.row').forEach((row, row_idx) => {
			let color = TIER_COLORS[row_idx % TIER_COLORS.length];
			let header = row.querySelector('.header');
			header.style.backgroundColor = color;
			header.querySelector('.row-color-picker').value = color;
		});
	} else {
		let rows = Array.from(tierlist_div.querySelectorAll(".row"));
		let color = TIER_COLORS[idx % TIER_COLORS.length];
		let header = rows[idx].querySelector('.header');
		header.style.backgroundColor = color;
		header.querySelector('.row-color-picker').value = color;
	}
}

function bind_trash_events() {
	let trash = document.getElementById('trash');
	trash.classList.add('droppable');
	trash.addEventListener('dragenter', (evt) => {
		evt.preventDefault();
		evt.target.src = 'trash_bin_open.png';
	});
	trash.addEventListener('dragexit', (evt) => {
		evt.preventDefault();
		evt.target.src = 'trash_bin.png';
	});
	trash.addEventListener('dragover', (evt) => {
		evt.preventDefault();
	});
	trash.addEventListener('drop', (evt) => {
		evt.preventDefault();
		evt.target.src = 'trash_bin.png';
		if (dragged_image) {
			let dragged_image_parent = dragged_image.parentNode;
			if (dragged_image_parent.tagName.toUpperCase() === 'SPAN' &&
					dragged_image_parent.classList.contains('item'))
			{
				// We were already in a tier
				let containing_tr = dragged_image_parent.parentNode;
				containing_tr.removeChild(dragged_image_parent);
			}
			dragged_image.remove();
		}
	});
}

function bind_toggle_layout_events() {
	let toggle = document.getElementById('toggle-layout');
	toggle.addEventListener('click', () => {
		set_layout((cur_layout + 1) % 2);
	});
}

function set_layout(layout) {
	let main = document.getElementsByClassName("main-content")[0];
	if (layout === LAYOUT_VERTICAL) {
		main.classList.add("vertical");
	} else {
		main.classList.remove("vertical");
	}
	cur_layout = layout;
}

function is_url (str) {
	try {
		new URL(str);
		return true;
	} catch (e) {
		return false;
	}
}

// Fetches a tierlist JSON file from the 'url' query parameter and loads it
async function try_load_tierlist_json () {
	const load_from_url = new URLSearchParams(window.location.search).get('url');
	if (load_from_url !== null && is_url(load_from_url)) {
		try {
			let result = await fetch(load_from_url);
			result = await result.json();
			hard_reset_list();
			load_tierlist(result);
		} catch (e) { console.error(e); }
	}
}
