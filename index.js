import * as fs from 'fs/promises';
import { JSDOM } from 'jsdom';
import SVGPathCommander from 'svg-path-commander';
import jq from 'jquery';
import path from 'path';
import { zip } from 'zip-a-folder';

const { window } = new JSDOM();
const $ = jq(window);
const targetDirPlaceholder = './output/package/com.apple.sfsymbols.§VERSION§.sdIconPack';

/**
 * Capitalizes first letter of a string
 * @param {string} string 
 * @returns 
 */
const capitalizeFirstLetter = ([first, ...rest]) => {
  return [first.toUpperCase(), ...rest].join('');
}

/**
 * Copies a directory with all its children from a to b
 * @param {string} src 
 * @param {string} dest 
 */
const copyDir = async (src, dest) => {
  const entries = await fs.readdir(src, { withFileTypes: true });
  await fs.mkdir(dest, { recursive: true } );

  for(let entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
          await copyDir(srcPath, destPath);
      } else {
          await fs.copyFile(srcPath, destPath);
      }
  }
};

/**
 * Generates plugin files
 * 
 * @param {string} version 
 */
const generateIcons = async (version) => {
  let targetDir = targetDirPlaceholder.replace('§VERSION§', version);
  // Create directories
  await fs.mkdir(`${targetDir}/icons`, { recursive: true });

  // Get forbidden files
  let forbidden = (await fs.readdir('./svg/forbidden')).map(e => e.replace('.svg', ''));

  // Get SVG source files
  let files = (await fs.readdir(`./svg/${version}`)).map(e => e.replace('.svg', ''));

  // initialize icons object with name, path
  let icons = files.filter(name => !forbidden.includes(name)).map(name => {
    return {
      name,
      path: `${name}.svg`
    };
  });

  // Update each icon to match Stream Deck layout and size
  const promises = icons.map(async file => {
    try {
      let name = file.name;

      // read the icons source
      let icon = await fs.readFile(`./svg/${version}/${name}.svg`, 'utf-8');

      // Append the icon to a jQuery div for easier manipulation
      let html = $('<div />').append(icon);

      // Find out the original icon size
      let originalWidth = parseInt(html.find('svg').attr('width'), 10);
      let originalHeight = parseInt(html.find('svg').attr('height'), 10);

      // Set target color and size
      html.find('svg')
        .attr('width', '144')
        .attr('height', '144')
        .removeAttr('viewBox');

      html.find('rect').remove();

      // Transform each path object of the svg to fit into new size
      html.find('path').toArray().forEach(el => {
        let jqel = $(el);
        let path = jqel.attr('d');

        // icon padding for all directions
        let padding = 30;
        let newPath;

        if (originalWidth >= originalHeight) {
          let scale = (144 - (padding * 2)) / originalWidth;
          let newHeight = scale * originalHeight;
          let altPadding = (144 - newHeight) / 2;

          newPath = new SVGPathCommander(path).transform({
            translate: [padding, altPadding], // move to the padding size
            scale, // calculate the scale depending on padding and original size
            origin: [0, 0]
          }).toString();
        } else {
          let scale = (144 - (padding * 2)) / originalHeight;
          let newWidth = scale * originalWidth;
          let altPadding = (144 - newWidth) / 2;

          newPath = new SVGPathCommander(path).transform({
            translate: [altPadding, padding], // move to the padding size
            scale, // calculate the scale depending on padding and original size
            origin: [0, 0]
          }).toString();
        }

        jqel.attr('d', newPath);
      });
      
      icon = html.html();

      // Write the new svg file to the target directory
      fs.writeFile(`${targetDir}/icons/${name}.svg`, icon);
      return file;
    } catch (e) {
      return null;
    }
  });

  // Wait for all icons to complete
  icons = (await Promise.all(promises)).filter(e => e !== null);

  // Save all icon information
  await fs.writeFile(`${targetDir}/icons.json`, JSON.stringify(icons, null, 2));

  // Copy assets
  await fs.cp('./assets/icon.png', `${targetDir}/icon.png`);
  await fs.cp('./assets/license.txt', `${targetDir}/license.txt`);
  await copyDir(`./assets/previews-${version}`, `${targetDir}/previews`);

  // Set manifest version and save it to the target directory
  let versionname = capitalizeFirstLetter(version);
  let manifest = JSON.parse(await fs.readFile('./assets/manifest.json'));
  manifest.name = `Apple SF Symbols - ${versionname}`;
  manifest.Description = `${versionname} variant of Apples SF Symbols`;

  await fs.writeFile(`${targetDir}/manifest.json`, JSON.stringify(manifest, null, 2));
};

/**
 * Helper function needed for running the async methods
 */
(async () => {
  let versions = ['monochrome', 'hierarchical', 'multicolor', 'palette'];

  for (let i = 0; i < versions.length; i++) {
    let version = versions[i];

    // Generate icon plugin directory
    await generateIcons(version);

    // create streamDeckIconPack zip file
    await zip('./output/package', `./output/com.apple.sfsymbols.${version}.streamDeckIconPack`);

    // Remove tmp dir
    await fs.rm('./output/package', { recursive: true });

    console.log(`com.apple.sfsymbols.${version}.streamDeckIconPack written.`);
  }
})();
