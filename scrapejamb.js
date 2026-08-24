import puppeteer from "puppeteer";
import fs from "fs/promises";
import path from "path";

const START_URL = "https://ibass.jamb.gov.ng/e-syllabus";

const DOWNLOAD_DIR = path.resolve("./downloads");

await fs.mkdir(DOWNLOAD_DIR, {
  recursive: true
});

function safeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {

  console.log("🚀 Starting browser...");

  const browser = await puppeteer.launch({

    /*
     * IMPORTANT
     * false = YOU CAN SEE THE BROWSER
     */
    headless: false,

    defaultViewport: null,

    args: [
      "--start-maximized",
      "--no-sandbox",
      "--disable-setuid-sandbox"
    ]
  });

  const page = await browser.newPage();

  /*
   * -----------------------------------------------------
   * SHOW EVERY PDF REQUEST
   * -----------------------------------------------------
   */

  page.on("response", response => {

    const url = response.url();

    const contentType =
      response.headers()["content-type"] || "";

    if (
      contentType
        .toLowerCase()
        .includes("application/pdf") ||
      url.toLowerCase().includes(".pdf")
    ) {

      console.log("");
      console.log("📄 PDF REQUEST");
      console.log("--------------------------------");
      console.log(url);
      console.log("--------------------------------");
    }
  });

  /*
   * -----------------------------------------------------
   * OPEN WEBSITE
   * -----------------------------------------------------
   */

  console.log("🌍 Opening:");
  console.log(START_URL);

  await page.goto(START_URL, {
    waitUntil: "networkidle2",
    timeout: 60000
  });

  console.log("✅ Page loaded.");

  await sleep(3000);

  /*
   * -----------------------------------------------------
   * SET SHOW ENTRIES TO 25
   * -----------------------------------------------------
   */

  console.log("");
  console.log("🔎 Looking for entries selector...");

  const selectInfo = await page.evaluate(() => {

    const selects =
      [...document.querySelectorAll("select")];

    return selects.map(select => ({
      value: select.value,
      options: [...select.options].map(o => ({
        text: o.text,
        value: o.value
      }))
    }));
  });

  console.log(
    "Selects found:",
    JSON.stringify(selectInfo, null, 2)
  );

  /*
   * Try to find the select containing 12
   */

  const selectResult = await page.evaluate(() => {

    const selects =
      [...document.querySelectorAll("select")];

    const select =
      selects.find(s =>
        [...s.options].some(
          option =>
            option.text.trim() === "12" ||
            option.value === "12"
        )
      );

    if (!select) {
      return false;
    }

    const option25 =
      [...select.options].find(option =>
        option.text.trim() === "25" ||
        option.value === "25"
      );

    if (!option25) {
      return false;
    }

    select.value = option25.value;

    select.dispatchEvent(
      new Event("change", {
        bubbles: true
      })
    );

    return true;
  });

  if (selectResult) {

    console.log(
      "✅ Changed entries to 25."
    );

    await sleep(2000);

  } else {

    console.log(
      "⚠️ Could not find 25-entry selector."
    );
  }

  /*
   * -----------------------------------------------------
   * GET REAL SUBJECT CARDS
   * -----------------------------------------------------
   *
   * IMPORTANT:
   * We specifically look for cards containing
   * "View details".
   *
   * We don't use every element containing the text.
   */

  async function getSubjects() {

    return await page.evaluate(() => {

      const result = [];

      /*
       * Find elements whose text is EXACTLY
       * "View details"
       */

      const viewElements =
        [...document.querySelectorAll("*")]
          .filter(el =>
            el.children.length === 0 &&
            el.textContent
              ?.trim()
              .toLowerCase() ===
              "view details"
          );

      for (const viewElement of viewElements) {

        /*
         * Walk upward until we find the card.
         */

        let card =
          viewElement.parentElement;

        for (let i = 0; i < 8 && card; i++) {

          const text =
            card.innerText?.trim() || "";

          /*
           * Subject cards contain:
           *
           * Subject name
           * View details
           *
           * and aren't huge containers.
           */

          if (
            text.toLowerCase()
              .includes("view details") &&
            text.length < 250
          ) {
            break;
          }

          card = card.parentElement;
        }

        if (!card) continue;

        /*
         * Get text lines.
         */

        const lines =
          card.innerText
            .split("\n")
            .map(x => x.trim())
            .filter(Boolean);

        /*
         * Remove View details.
         */

        const possibleNames =
          lines.filter(line =>
            line.toLowerCase() !==
            "view details"
          );

        /*
         * Subject name is normally the line
         * closest to View details.
         */

        let name =
          possibleNames
            .find(line =>
              !line.toLowerCase()
                .includes("view")
            );

        if (!name) continue;

        /*
         * Ignore known page elements.
         */

        const ignored = [
          "dashboard",
          "e-syllabus",
          "search subjects",
          "pdf syllabus",
          "show",
          "entries",
          "previous",
          "next"
        ];

        if (
          ignored.includes(
            name.toLowerCase()
          )
        ) {
          continue;
        }

        /*
         * Avoid duplicates.
         */

        if (
          !result.some(
            item =>
              item.name.toLowerCase() ===
              name.toLowerCase()
          )
        ) {

          result.push({
            name
          });
        }
      }

      return result;
    });
  }

  /*
   * -----------------------------------------------------
   * SCRAPE CURRENT PAGE
   * -----------------------------------------------------
   */

  let allSubjects = [];

  let pageNumber = 1;

  while (true) {

    console.log("");
    console.log(
      `📑 Reading subject page ${pageNumber}...`
    );

    await sleep(1000);

    const subjects =
      await getSubjects();

    console.log(
      `Found ${subjects.length} subjects on this page.`
    );

    console.table(subjects);

    /*
     * Add to all subjects
     */

    for (const subject of subjects) {

      if (
        !allSubjects.some(
          item =>
            item.name.toLowerCase() ===
            subject.name.toLowerCase()
        )
      ) {

        allSubjects.push(subject);
      }
    }

    /*
     * ---------------------------------------------------
     * CHECK NEXT BUTTON
     * ---------------------------------------------------
     */

    const nextResult =
      await page.evaluate(() => {

        const elements =
          [...document.querySelectorAll("*")];

        const next =
          elements.find(el =>
            el.children.length === 0 &&
            el.textContent
              ?.trim()
              .toLowerCase() === "next"
          );

        if (!next) {
          return {
            exists: false,
            disabled: true
          };
        }

        const button =
          next.closest(
            "button, a"
          );

        if (button) {

          return {
            exists: true,
            disabled:
              button.disabled ||
              button.classList.contains(
                "disabled"
              ) ||
              button.getAttribute(
                "aria-disabled"
              ) === "true"
          };
        }

        return {
          exists: true,
          disabled: false
        };
      });

    console.log(
      "Next button:",
      nextResult
    );

    if (
      !nextResult.exists ||
      nextResult.disabled
    ) {
      break;
    }

    /*
     * Click next
     */

    console.log(
      "➡️ Going to next subject page..."
    );

    await page.evaluate(() => {

      const elements =
        [...document.querySelectorAll("*")];

      const next =
        elements.find(el =>
          el.children.length === 0 &&
          el.textContent
            ?.trim()
            .toLowerCase() === "next"
        );

      if (next) {
        next.click();
      }
    });

    await sleep(2000);

    pageNumber++;
  }

  /*
   * -----------------------------------------------------
   * SHOW ALL SUBJECTS
   * -----------------------------------------------------
   */

  console.log("");
  console.log(
    "=========================================="
  );

  console.log(
    `📚 TOTAL SUBJECTS FOUND: ${allSubjects.length}`
  );

  console.log(
    "=========================================="
  );

  console.table(allSubjects);

  /*
   * -----------------------------------------------------
   * DOWNLOAD EACH PDF
   * -----------------------------------------------------
   */

  const results = [];

  for (
    let i = 0;
    i < allSubjects.length;
    i++
  ) {

    const subject =
      allSubjects[i];

    console.log("");
    console.log(
      "=========================================="
    );

    console.log(
      `📖 ${i + 1}/${allSubjects.length}`
    );

    console.log(
      `📚 ${subject.name}`
    );

    console.log(
      "=========================================="
    );

    try {

      /*
       * -------------------------------------------------
       * FIND THE SUBJECT CARD
       * -------------------------------------------------
       */

      const found =
        await page.evaluate(
          subjectName => {

            const views =
              [...document.querySelectorAll("*")]
                .filter(el =>
                  el.children.length === 0 &&
                  el.textContent
                    ?.trim()
                    .toLowerCase() ===
                    "view details"
                );

            for (const view of views) {

              let card =
                view.parentElement;

              for (
                let i = 0;
                i < 8 && card;
                i++
              ) {

                const text =
                  card.innerText
                    ?.trim() || "";

                if (
                  text
                    .toLowerCase()
                    .includes(
                      subjectName.toLowerCase()
                    ) &&
                  text
                    .toLowerCase()
                    .includes(
                      "view details"
                    )
                ) {

                  view.click();

                  return true;
                }

                card =
                  card.parentElement;
              }
            }

            return false;
          },
          subject.name
        );

      if (!found) {

        console.log(
          `❌ Could not click ${subject.name}`
        );

        results.push({
          ...subject,
          status: "not_found"
        });

        continue;
      }

      console.log(
        "🖱️ View details clicked."
      );

      /*
       * -------------------------------------------------
       * WAIT FOR PDF
       * -------------------------------------------------
       */

      let pdfUrl = null;

      const pdfPromise =
        new Promise(resolve => {

          let finished = false;

          const timer =
            setTimeout(() => {

              if (!finished) {

                finished = true;

                page.off(
                  "response",
                  handler
                );

                resolve(null);
              }

            }, 15000);

          const handler =
            response => {

              const url =
                response.url();

              const type =
                response.headers()[
                  "content-type"
                ] || "";

              /*
               * VERY IMPORTANT:
               *
               * Ignore blob URLs.
               */

              if (
                url.startsWith("blob:")
              ) {
                return;
              }

              if (
                type
                  .toLowerCase()
                  .includes(
                    "application/pdf"
                  ) ||
                url
                  .toLowerCase()
                  .includes(".pdf")
              ) {

                if (!finished) {

                  finished = true;

                  clearTimeout(timer);

                  page.off(
                    "response",
                    handler
                  );

                  resolve(url);
                }
              }
            };

          page.on(
            "response",
            handler
          );
        });

      /*
       * Give the website time to load PDF.
       */

      pdfUrl =
        await pdfPromise;

      /*
       * -------------------------------------------------
       * IF PDF FOUND
       * -------------------------------------------------
       */

      if (pdfUrl) {

        console.log("");
        console.log(
          "✅ REAL PDF FOUND:"
        );

        console.log(pdfUrl);

        /*
         * ------------------------------------------------
         * DOWNLOAD USING PAGE REQUEST
         * ------------------------------------------------
         */

        const pdfPage =
          await browser.newPage();

        /*
         * Copy cookies from current page.
         */

        const cookies =
          await page.cookies();

        await pdfPage.setCookie(
          ...cookies
        );

        console.log(
          "⬇️ Downloading..."
        );

        const response =
          await pdfPage.goto(
            pdfUrl,
            {
              waitUntil: "networkidle2",
              timeout: 60000
            }
          );

        if (!response) {

          throw new Error(
            "No response from PDF URL"
          );
        }

        const buffer =
          await response.buffer();

        const filename =
          safeFilename(
            subject.name
          ) + ".pdf";

        const filepath =
          path.join(
            DOWNLOAD_DIR,
            filename
          );

        await fs.writeFile(
          filepath,
          buffer
        );

        console.log(
          `✅ SAVED: ${filename}`
        );

        console.log(
          `📦 SIZE: ${(
            buffer.length /
            1024 /
            1024
          ).toFixed(2)} MB`
        );

        results.push({

          name: subject.name,

          pdfUrl,

          filename,

          filepath,

          size: buffer.length,

          status: "downloaded"

        });

        await pdfPage.close();

      } else {

        console.log(
          `❌ No PDF found for ${subject.name}`
        );

        results.push({

          name: subject.name,

          status: "pdf_not_found"

        });
      }

      /*
       * -------------------------------------------------
       * CLOSE MODAL
       * -------------------------------------------------
       */

      console.log(
        "❎ Closing PDF..."
      );

      await page.keyboard.press(
        "Escape"
      );

      await sleep(1000);

    } catch (error) {

      console.log(
        `❌ ERROR: ${error.message}`
      );

      results.push({

        name: subject.name,

        status: "error",

        error: error.message

      });
    }
  }

  /*
   * -----------------------------------------------------
   * SAVE RESULTS
   * -----------------------------------------------------
   */

  await fs.writeFile(

    "./scrape-results.json",

    JSON.stringify(
      results,
      null,
      2
    ),

    "utf8"

  );

  console.log("");
  console.log(
    "=========================================="
  );

  console.log(
    "🎉 SCRAPING FINISHED"
  );

  console.log(
    "=========================================="
  );

  console.table(
    results.map(item => ({

      subject: item.name,

      status: item.status,

      file:
        item.filename || ""

    }))
  );

  console.log("");
  console.log(
    `📁 PDFs: ${DOWNLOAD_DIR}`
  );

  console.log(
    `📄 Results: ./scrape-results.json`
  );

  /*
   * Keep browser open so you can inspect it.
   */

  console.log("");
  console.log(
    "Browser will remain open."
  );

  console.log(
    "Press CTRL+C when you are finished."
  );
}

main().catch(error => {

  console.error("");
  console.error(
    "💥 FATAL ERROR"
  );

  console.error(error);

});