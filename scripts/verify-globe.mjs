import { chromium } from 'playwright';

const targetUrl = process.env.GLOBE_URL ?? 'http://127.0.0.1:4321/';

async function canvasStats(page) {
  return page.evaluate(async () => {
    const canvas = document.querySelector('.globe-canvas');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Globe canvas not found');

    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const image = new Image();
    image.src = canvas.toDataURL('image/png');
    await image.decode();

    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = canvas.width;
    sampleCanvas.height = canvas.height;
    const context = sampleCanvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Could not create sample canvas');
    context.drawImage(image, 0, 0);

    const pixels = context.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height).data;
    let opaque = 0;
    let checksum = 0;
    const colors = new Set();
    for (let index = 0; index < pixels.length; index += 64) {
      const alpha = pixels[index + 3];
      if (alpha < 24) continue;
      opaque += 1;
      checksum = (checksum + pixels[index] * 3 + pixels[index + 1] * 5 + pixels[index + 2] * 7 + index) % 1000000007;
      colors.add(`${pixels[index] >> 4},${pixels[index + 1] >> 4},${pixels[index + 2] >> 4}`);
    }

    return {
      width: canvas.width,
      height: canvas.height,
      opaque,
      colors: colors.size,
      checksum,
      signature: image.src.slice(-600)
    };
  });
}

async function findInteractivePoint(page, canvasBox, predicate = () => true) {
  const xRatios = [0.22, 0.3, 0.38, 0.46, 0.54, 0.62, 0.7, 0.78];
  const yRatios = [0.22, 0.3, 0.38, 0.46, 0.54, 0.62, 0.7, 0.78];

  for (const yRatio of yRatios) {
    for (const xRatio of xRatios) {
      const x = canvasBox.x + canvasBox.width * xRatio;
      const y = canvasBox.y + canvasBox.height * yRatio;
      await page.mouse.move(x, y);
      await page.waitForTimeout(60);
      const hoverId = await page.locator('.globe-canvas').evaluate((canvas) => canvas.dataset.hoverId ?? '');
      if (!hoverId) continue;
      if (predicate({ x, y, hoverId, xRatio, yRatio })) return { x, y, hoverId, xRatio, yRatio };
    }
  }

  return undefined;
}

async function verifyViewport(browser, name, viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: name === 'mobile' ? 2 : 1, isMobile: name === 'mobile', hasTouch: name === 'mobile' });
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto(targetUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('.globe-canvas');
  await page.waitForFunction(() => document.querySelector('.globe-canvas')?.clientWidth > 250);

  const initialStats = await canvasStats(page);
  if (initialStats.opaque < 2000 || initialStats.colors < 12) {
    throw new Error(`${name}: globe canvas looks blank or flat (${JSON.stringify(initialStats)})`);
  }

  const canvasBox = await page.locator('.globe-canvas').boundingBox();
  if (!canvasBox) throw new Error(`${name}: canvas bounding box unavailable`);
  const centerX = canvasBox.x + canvasBox.width / 2;
  const centerY = canvasBox.y + canvasBox.height / 2;

  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX + Math.min(180, canvasBox.width * 0.25), centerY + 30, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(150);

  const afterDragStats = await canvasStats(page);
  if (afterDragStats.signature === initialStats.signature) {
    throw new Error(`${name}: globe pixels did not change after drag`);
  }

  const initialDrink = await page.locator('.drink-title').innerText();
  let selectedDrink = initialDrink;

  if (name === 'desktop') {
    const hoverPoint = await findInteractivePoint(page, canvasBox);
    if (!hoverPoint) throw new Error(`${name}: could not find a hovered country on the current globe view`);

    const hoverDrink = await page.locator('.drink-title').innerText();
    if (hoverDrink !== initialDrink) throw new Error(`${name}: hover changed selected drink from ${initialDrink} to ${hoverDrink}`);
    const hoverStats = await canvasStats(page);
    const hoverChangedPixels = hoverStats.checksum !== afterDragStats.checksum;

    if (!hoverChangedPixels) throw new Error(`${name}: hover did not visibly highlight a country`);
  }

  await page.mouse.move(centerX, centerY);
  const beforeDragDrink = await page.locator('.drink-title').innerText();
  await page.mouse.down();
  await page.mouse.move(centerX - Math.min(160, canvasBox.width * 0.22), centerY - 20, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(120);
  const afterSecondDragDrink = await page.locator('.drink-title').innerText();
  if (afterSecondDragDrink !== beforeDragDrink) {
    throw new Error(`${name}: drag changed selected drink from ${beforeDragDrink} to ${afterSecondDragDrink}`);
  }

  const selectionPoint = await findInteractivePoint(page, canvasBox);
  if (!selectionPoint) throw new Error(`${name}: could not find a selectable country on the current globe view`);

  if (name === 'mobile') {
    await page.touchscreen.tap(selectionPoint.x, selectionPoint.y);
  } else {
    await page.mouse.move(selectionPoint.x, selectionPoint.y);
    await page.mouse.click(selectionPoint.x, selectionPoint.y);
  }
  await page.waitForTimeout(120);
  selectedDrink = await page.locator('.drink-title').innerText();
  const selectedId = await page.locator('.globe-canvas').evaluate((canvas) => canvas.dataset.selectedId ?? '');

  if (selectedId !== selectionPoint.hoverId) {
    throw new Error(`${name}: clicked hovered country ${selectionPoint.hoverId}, but selected ${selectedId}`);
  }

  if (selectedDrink === initialDrink) {
    throw new Error(`${name}: globe pointer probes did not select a different country`);
  }

  if (name === 'mobile') {
    const beforePinchZ = Number(await page.locator('.globe-canvas').evaluate((canvas) => canvas.dataset.cameraZ ?? '0'));
    await page.locator('.globe-canvas').evaluate(async (canvasElement) => {
      const canvas = canvasElement;
      const rect = canvas.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dispatch = (type, pointerId, x, y) => {
        canvas.dispatchEvent(new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId,
          pointerType: 'touch',
          isPrimary: pointerId === 21,
          clientX: x,
          clientY: y,
          buttons: type === 'pointerup' ? 0 : 1
        }));
      };

      dispatch('pointerdown', 21, centerX - 28, centerY);
      dispatch('pointerdown', 22, centerX + 28, centerY);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      dispatch('pointermove', 21, centerX - 95, centerY);
      dispatch('pointermove', 22, centerX + 95, centerY);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      dispatch('pointerup', 21, centerX - 95, centerY);
      dispatch('pointerup', 22, centerX + 95, centerY);
    });
    await page.waitForTimeout(180);
    const afterPinchZ = Number(await page.locator('.globe-canvas').evaluate((canvas) => canvas.dataset.cameraZ ?? '0'));
    if (!(afterPinchZ > 0) || Math.abs(afterPinchZ - beforePinchZ) < 0.08) {
      throw new Error(`${name}: pinch zoom did not change camera distance (${beforePinchZ} -> ${afterPinchZ})`);
    }
  }

  if (consoleErrors.length > 0) {
    throw new Error(`${name}: console/page errors: ${consoleErrors.join(' | ')}`);
  }

  await page.close();
  return { name, initialDrink, selectedDrink, width: initialStats.width, height: initialStats.height, colors: initialStats.colors };
}

const browser = await chromium.launch();
try {
  const results = [];
  results.push(await verifyViewport(browser, 'desktop', { width: 1440, height: 980 }));
  results.push(await verifyViewport(browser, 'mobile', { width: 390, height: 844 }));
  console.table(results);
} finally {
  await browser.close();
}