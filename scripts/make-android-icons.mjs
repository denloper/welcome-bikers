import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const svg = await readFile(path.join(root, "public/icons/app-icon.svg"), "utf8");
const res = path.join(root, "android/app/src/main/res");

const launchers = [
  ["mipmap-mdpi", 48],
  ["mipmap-hdpi", 72],
  ["mipmap-xhdpi", 96],
  ["mipmap-xxhdpi", 144],
  ["mipmap-xxxhdpi", 192],
];
const foregrounds = [
  ["mipmap-mdpi", 108],
  ["mipmap-hdpi", 162],
  ["mipmap-xhdpi", 216],
  ["mipmap-xxhdpi", 324],
  ["mipmap-xxxhdpi", 432],
];
const splashes = [
  ["drawable-port-mdpi", 320, 480],
  ["drawable-port-hdpi", 480, 800],
  ["drawable-port-xhdpi", 720, 1280],
  ["drawable-port-xxhdpi", 960, 1600],
  ["drawable-port-xxxhdpi", 1280, 1920],
  ["drawable-land-mdpi", 480, 320],
  ["drawable-land-hdpi", 800, 480],
  ["drawable-land-xhdpi", 1280, 720],
  ["drawable-land-xxhdpi", 1600, 960],
  ["drawable-land-xxxhdpi", 1920, 1280],
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

async function png(width, height, html) {
  await page.setViewportSize({ width, height });
  await page.setContent(html, { waitUntil: "load" });
  return page.screenshot({ type: "png", omitBackground: false });
}

function iconHtml(size) {
  return `<!doctype html><html><body style="margin:0;background:#111">${svg.replace(
    "<svg",
    `<svg width="${size}" height="${size}" style="display:block;width:${size}px;height:${size}px"`,
  )}</body></html>`;
}

function splashHtml(width, height, icon) {
  return `<!doctype html><html><body style="margin:0;background:#111;width:${width}px;height:${height}px;display:flex;align-items:center;justify-content:center">${svg.replace(
    "<svg",
    `<svg width="${icon}" height="${icon}" style="display:block;width:${icon}px;height:${icon}px"`,
  )}</body></html>`;
}

for (const [dir, size] of launchers) {
  const folder = path.join(res, dir);
  await mkdir(folder, { recursive: true });
  const bytes = await png(size, size, iconHtml(size));
  await writeFile(path.join(folder, "ic_launcher.png"), bytes);
  await writeFile(path.join(folder, "ic_launcher_round.png"), bytes);
}

for (const [dir, size] of foregrounds) {
  const folder = path.join(res, dir);
  await mkdir(folder, { recursive: true });
  const bytes = await png(size, size, iconHtml(size));
  await writeFile(path.join(folder, "ic_launcher_foreground.png"), bytes);
}

for (const [dir, width, height] of splashes) {
  const folder = path.join(res, dir);
  await mkdir(folder, { recursive: true });
  const icon = Math.round(Math.min(width, height) * 0.28);
  const bytes = await png(width, height, splashHtml(width, height, icon));
  await writeFile(path.join(folder, "splash.png"), bytes);
}

await browser.close();
console.log("android icons and splash updated");
