const puppeteer = require("puppeteer");
const config = require("./config.json");

async function report(log) {
  currentTime = new Date();
  console.log(currentTime.toString().split("G")[0] + ": " + log);
}
async function check_cart(page) {
  await page.waitForTimeout(250);
  try {
    await page.waitForSelector("form li.price-current", { timeout: 1000 });
    var element = await page.$("form li.price-current");
    var text = await page.evaluate((element) => element.textContent, element);
    await report("Card costs: " + text);
    if (parseInt(text.split("$")[1]) > config.price_limit) {
      await report("Price exceeds limit, removing from cart");
      var button = await page.$$("button.btn.btn-mini");
      while (true) {
        try {
          await button[2].evaluate((node) => node.click());
          return false;
        } catch (err) {
          break;
        }
        await page.waitForTimeout(100);
      }
      return false;
    }
    await report("Card added to cart, attempting to purchase");
    return true;
  } catch (err) {
    await report("Card not in stock");
    await page.waitForTimeout(config.refresh_time * 1000);
    return false;
  }
}

async function run() {
  await report("Started");
  const browser = await puppeteer.launch({
    args: [ '--js-flags=--expose-gc' ],
    devtools: false,
    headless: false,
    product: "chrome",
    defaultViewport: { width: 1366, height: 768 },
  });
  const page = await browser.newPage();

  while (true) {
    await page.goto(
      "https://secure.newegg.com/NewMyAccount/AccountLogin.aspx?nextpage=https%3a%2f%2fwww.newegg.com%2f",
      { waitUntil: "load" }
    );
    if (page.url().includes("signin")) {
      await page.waitForSelector("button.btn.btn-orange");
      await page.type("#labeled-input-signEmail", config.email);
      await page.click("button.btn.btn-orange");
      await page.waitForTimeout(1500);
      try {
        await page.waitForSelector("#labeled-input-signEmail", {
          timeout: 500,
        });
      } catch (err) {
        try {
          await page.waitForSelector("#labeled-input-password", {
            timeout: 2500,
          });
          await page.waitForSelector("button.btn.btn-orange");
          await page.type("#labeled-input-password", config.password);
          await page.click("button.btn.btn-orange");
          await page.waitForTimeout(1500);
          try {
            await page.waitForSelector("#labeled-input-password", {
              timeout: 500,
            });
          } catch (err) {
            break;
          }
        } catch (err) {
          report(
            "Manual authorization code required by Newegg.  This should only happen once."
          );
          while (page.url().includes("signin")) {
            await page.waitForTimeout(500);
          }
          break;
        }
      }
    } else if (page.url().includes("areyouahuman")) {
      await page.waitForTimeout(1000);
    }
    await page.waitForTimeout(100);
  }

  await report("Logged in");
  await report("Checking for card");

  while (true) {
    await page.evaluate(() => gc());
    try {
      if (global.gc) {global.gc();}
    } catch(e) {
      console.log("`node --expose-gc`")
      process.exit();
    }
    try {
      await page.goto(
        "https://secure.newegg.com/Shopping/AddtoCart.aspx?Submit=ADD&ItemList=" +
          config.item_number,
        { waitUntil: "load" }
      );
      if (page.url().includes("shop/cart")) {
        var check = await check_cart(page);
        if (check) {
          break;
        }
      } else if (page.url().includes("ShoppingItem")) {
        await page.goto("https://secure.newegg.com/shop/cart", {
          waitUntil: "load",
        });
        var check = await check_cart(page);
        if (check) {
          break;
        }
      } else if (page.url().includes("areyouahuman")) {
        await page.waitForTimeout(1000);
      }
    } catch (err) {
      continue;
    }
    await page.waitForTimeout(100);
    var nowTime = new Date();
    var timeDiffMinutes = Math.round((nowTime - startTime) / 1000) / 60;
    // If browser has been open too long
    // Close it to work around memory leak
    if (timeDiffMinutes >= 20) {
      await report("Killing the browser for a restart");
      await browser.close();
      return false;
    }
  }

  await report("Card found!");

  while (true) {
    try {
      await report("Looking for checkout button");
      await page.waitForSelector("div.summary-actions", { timeout: 500 });
      var checkout_button = await page.$(
        "div.summary-actions > button.btn-primary",
        { timeout: 100 }
      );
      await checkout_button.evaluate((node) => node.click());
      break;
    } catch (err) {
      await report(err);
    }
  }

  while (true) {
    try {
      await report("Looking for cvv code");
      await page.waitForSelector("input[placeholder=CVV2]", { timeout: 500 });
      await page.type("input[placeholder=CVV2]", config.cv2);
      break;
    } catch (err) {}
    try {
      await page.waitForSelector("#creditCardCVV2", { timeout: 500 });
      await page.type("#creditCardCVV2", config.cv2);
      break;
    } catch (err) {}
    await page.waitForTimeout(100);
  }

  try {
    await page.waitForSelector("#term", { timeout: 5000 });
    await page.click("#term");
  } catch (err) {}

  if (config.auto_submit == "true") {
    await page.click("#SubmitOrder");
  }
  await report("Completed purchase");
  //await browser.close()
}

run();
