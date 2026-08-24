const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

// =========================================================
// FCTEMIS COMPLETE SCRAPER
// SS1 + SS2 + SS3
// SUBJECTS AUTOMATICALLY DETECTED
// FRESH START + RESUME
// VISIBLE BROWSER
// NETWORK RETRY
// CONTINUOUS SAVE
// =========================================================

const BASE_URL = "https://fctemis.org";

// =========================================================
// CONFIGURATION
// =========================================================

// IMPORTANT:
//
// true  = DELETE OLD SCRAPER DATA AND START AGAIN
// false = RESUME FROM PREVIOUS PROGRESS
//
// Use true for your first clean run.
const START_FRESH = false;

const CLASS_LEVELS = [
  {
    name: "SS 1",
    cid: 10
  },
  {
    name: "SS 2",
    cid: 11
  },
  {
    name: "SS 3",
    cid: 12
  }
];

const OUTPUT_FILE = path.join(
  __dirname,
  "fctemis_resources.json"
);

const PROGRESS_FILE = path.join(
  __dirname,
  "fctemis_progress.json"
);

// =========================================================
// SELECTORS
// =========================================================

const TABLE_SELECTOR =
  "#demo-datatables-buttons-2";

const ROW_SELECTOR =
  `${TABLE_SELECTOR} tbody tr`;

const NEXT_SELECTOR =
  `${TABLE_SELECTOR}_next`;

// =========================================================
// SETTINGS
// =========================================================

const PAGE_TIMEOUT = 90000;

const MAX_NAVIGATION_RETRIES = 5;

const MAX_PAGE_RETRIES = 4;

const DELAY_BETWEEN_SUBJECTS = 1500;

const DELAY_BETWEEN_CLASSES = 1000;

const DELAY_AFTER_PAGE = 1200;

// =========================================================
// DELAY
// =========================================================

function delay(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

// =========================================================
// CLEAN TEXT
// =========================================================

function cleanText(value) {
  if (!value) {
    return "";
  }

  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

// =========================================================
// NORMALIZE SUBJECT NAME
// =========================================================

function normalizeSubjectName(name) {
  return cleanText(name)
    .toLowerCase()
    .replace(/[^\w]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// =========================================================
// NORMALIZE DATE
// =========================================================

function normalizeDate(value) {
  value = cleanText(value);

  if (!value) {
    return "";
  }

  const parts = value.split("/");

  if (parts.length === 3) {
    const [day, month, year] = parts;

    return `${year}-${month.padStart(2, "0")}-${day.padStart(
      2,
      "0"
    )}`;
  }

  return value;
}

// =========================================================
// CREATE JOB KEY
// =========================================================

function createJobKey(subject, classInfo) {
  return `${subject.sid}-${classInfo.cid}`;
}

// =========================================================
// DELETE OLD DATA
// =========================================================

function startFresh() {
  console.log("");
  console.log(
    "======================================"
  );

  console.log(
    "FRESH START ENABLED"
  );

  console.log(
    "======================================"
  );

  if (fs.existsSync(OUTPUT_FILE)) {
    fs.unlinkSync(OUTPUT_FILE);

    console.log(
      "Deleted:",
      OUTPUT_FILE
    );
  }

  if (fs.existsSync(PROGRESS_FILE)) {
    fs.unlinkSync(PROGRESS_FILE);

    console.log(
      "Deleted:",
      PROGRESS_FILE
    );
  }

  console.log(
    "Starting from the beginning..."
  );

  console.log("");
}

// =========================================================
// LOAD EXISTING RESOURCES
// =========================================================

function loadExistingResources() {
  if (!fs.existsSync(OUTPUT_FILE)) {
    return [];
  }

  try {
    const data = JSON.parse(
      fs.readFileSync(
        OUTPUT_FILE,
        "utf8"
      )
    );

    // New format
    if (
      data &&
      Array.isArray(data.resources)
    ) {
      return data.resources;
    }

    // Old format
    if (Array.isArray(data)) {
      return data;
    }

    // Existing arranged format
    if (
      data &&
      data.subjects &&
      typeof data.subjects === "object"
    ) {
      const resources = [];

      for (
        const subject of Object.values(
          data.subjects
        )
      ) {
        if (
          Array.isArray(
            subject.resources
          )
        ) {
          resources.push(
            ...subject.resources
          );
        }
      }

      return resources;
    }

  } catch (error) {
    console.log(
      "Could not read existing JSON."
    );

    console.log(
      error.message
    );
  }

  return [];
}

// =========================================================
// LOAD PROGRESS
// =========================================================

function loadProgress() {
  if (!fs.existsSync(PROGRESS_FILE)) {
    return {
      completedJobs: [],
      failedJobs: []
    };
  }

  try {
    const data = JSON.parse(
      fs.readFileSync(
        PROGRESS_FILE,
        "utf8"
      )
    );

    return {
      completedJobs:
        Array.isArray(
          data.completedJobs
        )
          ? data.completedJobs
          : [],

      failedJobs:
        Array.isArray(
          data.failedJobs
        )
          ? data.failedJobs
          : []
    };

  } catch (error) {
    console.log(
      "Could not read progress file."
    );

    return {
      completedJobs: [],
      failedJobs: []
    };
  }
}

// =========================================================
// SAVE PROGRESS
// =========================================================

function saveProgress(progress) {
  fs.writeFileSync(
    PROGRESS_FILE,
    JSON.stringify(
      {
        updatedAt:
          new Date().toISOString(),

        completedJobs:
          progress.completedJobs,

        failedJobs:
          progress.failedJobs
      },
      null,
      2
    ),
    "utf8"
  );
}

// =========================================================
// REMOVE FROM FAILED
// =========================================================

function removeFailedJob(
  progress,
  jobKey
) {
  progress.failedJobs =
    progress.failedJobs.filter(
      key => key !== jobKey
    );
}

// =========================================================
// MARK JOB COMPLETE
// =========================================================

function markJobComplete(
  progress,
  jobKey
) {
  if (
    !progress.completedJobs.includes(
      jobKey
    )
  ) {
    progress.completedJobs.push(
      jobKey
    );
  }

  removeFailedJob(
    progress,
    jobKey
  );

  saveProgress(progress);
}

// =========================================================
// MARK JOB FAILED
// =========================================================

function markJobFailed(
  progress,
  jobKey
) {
  if (
    !progress.failedJobs.includes(
      jobKey
    )
  ) {
    progress.failedJobs.push(
      jobKey
    );
  }

  saveProgress(progress);
}

// =========================================================
// RETRY NAVIGATION
// =========================================================

async function gotoWithRetry(
  page,
  url,
  label = ""
) {
  let lastError = null;

  for (
    let attempt = 1;
    attempt <= MAX_NAVIGATION_RETRIES;
    attempt++
  ) {
    try {
      console.log(
        `Opening ${label || url}`
      );

      console.log(
        `Attempt ${attempt}/${MAX_NAVIGATION_RETRIES}`
      );

      await page.goto(
        url,
        {
          waitUntil: "domcontentloaded",
          timeout: PAGE_TIMEOUT
        }
      );

      // Give DataTables/JavaScript time
      await delay(2500);

      return true;

    } catch (error) {
      lastError = error;

      console.log("");
      console.log(
        `⚠️ Navigation failed`
      );

      console.log(
        error.message
      );

      if (
        attempt <
        MAX_NAVIGATION_RETRIES
      ) {
        console.log(
          "Retrying..."
        );

        await delay(
          4000 * attempt
        );
      }
    }
  }

  throw lastError;
}

// =========================================================
// WAIT FOR PAGE
// =========================================================

async function waitForPageContent(page) {
  try {
    await page.waitForFunction(
      () => {
        return (
          document.body &&
          document.body.innerText &&
          document.body.innerText.length > 100
        );
      },
      {
        timeout: 20000
      }
    );
  } catch {}

  await delay(1500);
}

// =========================================================
// GET SUBJECTS FOR CLASS
// =========================================================

async function getSubjectsForClass(
  page,
  classInfo
) {
  console.log("");
  console.log(
    "===================================="
  );

  console.log(
    `GETTING SUBJECTS: ${classInfo.name}`
  );

  console.log(
    "===================================="
  );

  const url =
    `${BASE_URL}/student_resources?cid=${classInfo.cid}`;

  console.log(url);

  let success = false;

  try {
    success =
      await gotoWithRetry(
        page,
        url,
        `${classInfo.name} subjects`
      );
  } catch (error) {
    console.log(
      "❌ Could not open subject page."
    );

    console.log(
      error.message
    );

    return [];
  }

  if (!success) {
    return [];
  }

  await waitForPageContent(page);

  // -------------------------------------------------------
  // First method: exact resource links
  // -------------------------------------------------------

  let subjects =
    await page.$$eval(
      "a[href*='view_student_resources']",
      (links, cid) => {
        const result = [];

        for (
          const link of links
        ) {
          const href =
            link.getAttribute(
              "href"
            );

          const text =
            link.innerText
              .replace(/\s+/g, " ")
              .trim();

          if (!href || !text) {
            continue;
          }

          const match =
            href.match(
              /sid=(\d+).*?cid=(\d+)/i
            );

          if (!match) {
            continue;
          }

          const sid = match[1];

          const linkCid =
            match[2];

          if (
            String(linkCid) !==
            String(cid)
          ) {
            continue;
          }

          result.push({
            sid,
            name: text,
            cid
          });
        }

        return result;
      },
      classInfo.cid
    );

  // -------------------------------------------------------
  // Second method if first method returns nothing
  // -------------------------------------------------------

  if (!subjects.length) {
    console.log(
      "⚠️ Normal subject selector found 0."
    );

    console.log(
      "Trying fallback extraction..."
    );

    subjects =
      await page.$$eval(
        "a",
        (links, cid) => {
          const result = [];

          for (
            const link of links
          ) {
            const href =
              link.getAttribute(
                "href"
              );

            if (!href) {
              continue;
            }

            const match =
              href.match(
                /view_student_resources.*?sid=(\d+).*?cid=(\d+)/i
              );

            if (!match) {
              continue;
            }

            if (
              String(match[2]) !==
              String(cid)
            ) {
              continue;
            }

            const text =
              link.innerText
                .replace(/\s+/g, " ")
                .trim();

            if (!text) {
              continue;
            }

            result.push({
              sid: match[1],
              name: text,
              cid
            });
          }

          return result;
        },
        classInfo.cid
      );
  }

  // -------------------------------------------------------
  // Remove duplicates
  // -------------------------------------------------------

  const unique =
    [
      ...new Map(
        subjects.map(
          subject => [
            subject.sid,
            subject
          ]
        )
      ).values()
    ];

  console.log("");
  console.log(
    `Found ${unique.length} subjects`
  );

  for (
    const subject of unique
  ) {
    console.log(
      `SID ${subject.sid} → ${subject.name}`
    );
  }

  if (!unique.length) {
    console.log("");
    console.log(
      "⚠️ ZERO SUBJECTS FOUND"
    );

    console.log(
      "Current URL:",
      page.url()
    );

    // Save screenshot for debugging
    try {
      await page.screenshot({
        path: path.join(
          __dirname,
          `debug-subjects-${classInfo.cid}.png`,
          ),
        fullPage: true
      });

      console.log(
        "Debug screenshot saved."
      );
    } catch {}

    // Save HTML
    try {
      const html =
        await page.content();

      fs.writeFileSync(
        path.join(
          __dirname,
          `debug-subjects-${classInfo.cid}.html`
        ),
        html,
        "utf8"
      );

      console.log(
        "Debug HTML saved."
      );

    } catch {}
  }

  return unique;
}

// =========================================================
// SCRAPE CURRENT DATATABLE PAGE
// =========================================================

async function scrapeCurrentPage(
  page
) {
  return await page.$$eval(
    ROW_SELECTOR,
    (trs, BASE_URL) => {
      return trs
        .map(tr => {
          const cells =
            [
              ...tr.querySelectorAll(
                "td"
              )
            ];

          if (!cells.length) {
            return null;
          }

          const cellText =
            cells.map(td =>
              td.innerText
                .replace(/\s+/g, " ")
                .trim()
            );

          const allText =
            cellText
              .join(" ")
              .toLowerCase();

          if (
            allText.includes(
              "no matching records"
            ) ||
            allText.includes(
              "no data available"
            )
          ) {
            return null;
          }

          // ------------------------------------------------
          // Find lesson link
          // ------------------------------------------------

          const viewLink =
            tr.querySelector(
              'a[href*="lid="]'
            );

          const href =
            viewLink
              ? viewLink.getAttribute(
                  "href"
                )
              : null;

          // ------------------------------------------------
          // Columns
          // ------------------------------------------------

          let subject = "";
          let topic = "";
          let className = "";
          let date = "";
          let size = 0;
          let postedBy = "";

          if (
            cells.length >= 8
          ) {
            subject =
              cellText[2] || "";

            topic =
              cellText[3] || "";

            className =
              cellText[4] || "";

            date =
              cellText[5] || "";

            size =
              Number(
                (cellText[6] || "")
                  .replace(
                    /,/g,
                    ""
                  )
              ) || 0;

            postedBy =
              cellText[7] || "";
          }

          // ------------------------------------------------
          // Fallback selectors
          // ------------------------------------------------

          if (!subject) {
            subject =
              tr.querySelector(
                "td:nth-child(3)"
              )?.innerText
                ?.replace(
                  /\s+/g,
                  " "
                )
                .trim() || "";
          }

          if (!topic) {
            topic =
              tr.querySelector(
                "td:nth-child(4)"
              )?.innerText
                ?.replace(
                  /\s+/g,
                  " "
                )
                .trim() || "";
          }

          if (!className) {
            className =
              tr.querySelector(
                "td:nth-child(5)"
              )?.innerText
                ?.replace(
                  /\s+/g,
                  " "
                )
                .trim() || "";
          }

          if (!date) {
            date =
              tr.querySelector(
                "td:nth-child(6)"
              )?.innerText
                ?.replace(
                  /\s+/g,
                  " "
                )
                .trim() || "";
          }

          if (!postedBy) {
            postedBy =
              tr.querySelector(
                "td:nth-child(8)"
              )?.innerText
                ?.replace(
                  /\s+/g,
                  " "
                )
                .trim() || "";
          }

          // ------------------------------------------------
          // Lesson ID
          // ------------------------------------------------

          let lessonId = null;

          if (href) {
            const match =
              href.match(
                /lid=(\d+)/i
              );

            if (match) {
              lessonId =
                match[1];
            }
          }

          // ------------------------------------------------
          // URL
          // ------------------------------------------------

          let url = null;

          if (href) {
            try {
              url =
                new URL(
                  href,
                  BASE_URL
                ).href;
            } catch {
              url = null;
            }
          }

          return {
            id:
              lessonId
                ? `fctemis-${lessonId}`
                : null,

            lessonId,

            subject,

            topic,

            class:
              className,

            date,

            size,

            postedBy,

            url
          };
        })
        .filter(Boolean);
    },
    BASE_URL
  );
}

// =========================================================
// GET FIRST ROW
// =========================================================

async function getFirstRowText(
  page
) {
  try {
    return await page.$eval(
      `${TABLE_SELECTOR} tbody tr:first-child`,
      el => el.innerText
    );
  } catch {
    return "";
  }
}

// =========================================================
// CHECK NEXT BUTTON
// =========================================================

async function isNextDisabled(
  page
) {
  try {
    return await page.$eval(
      NEXT_SELECTOR,
      el =>
        el.classList.contains(
          "disabled"
        ) ||
        el.getAttribute(
          "aria-disabled"
        ) === "true"
    );
  } catch {
    return true;
  }
}

// =========================================================
// CLICK NEXT
// =========================================================

async function clickNext(
  page
) {
  const button =
    await page.$(
      NEXT_SELECTOR
    );

  if (!button) {
    console.log(
      "Next button not found."
    );

    return false;
  }

  const disabled =
    await isNextDisabled(
      page
    );

  if (disabled) {
    console.log(
      "Reached last page."
    );

    return false;
  }

  const oldFirstRow =
    await getFirstRowText(
      page
    );

  try {
    await page.$eval(
      NEXT_SELECTOR,
      el => {
        el.scrollIntoView({
          block: "center"
        });
      }
    );
  } catch {}

  await delay(400);

  try {
    // Normal click
    await page.click(
      NEXT_SELECTOR
    );

  } catch {
    // JavaScript fallback
    try {
      await page.$eval(
        NEXT_SELECTOR,
        el => el.click()
      );
    } catch {
      console.log(
        "Could not click Next."
      );

      return false;
    }
  }

  // -------------------------------------------------------
  // Wait for DataTables
  // -------------------------------------------------------

  try {
    await page.waitForFunction(
      oldText => {
        const row =
          document.querySelector(
            "#demo-datatables-buttons-2 tbody tr:first-child"
          );

        if (!row) {
          return false;
        }

        return (
          row.innerText !==
          oldText
        );
      },
      {
        timeout: 15000
      },
      oldFirstRow
    );

  } catch {
    await delay(1800);
  }

  await delay(
    DELAY_AFTER_PAGE
  );

  return true;
}

// =========================================================
// SCRAPE ONE SUBJECT / CLASS
// =========================================================

async function scrapeSubject(
  page,
  subject,
  classInfo
) {
  const url =
    `${BASE_URL}/view_student_resources?sid=${subject.sid}&cid=${classInfo.cid}`;

  console.log("");
  console.log(
    "######################################"
  );

  console.log(
    `SUBJECT: ${subject.name}`
  );

  console.log(
    "######################################"
  );

  console.log("");
  console.log(
    `${subject.name} | ${classInfo.name}`
  );

  console.log(url);
  console.log("");

  // -------------------------------------------------------
  // Open page
  // -------------------------------------------------------

  let opened = false;

  try {
    opened =
      await gotoWithRetry(
        page,
        url,
        `${subject.name} | ${classInfo.name}`
      );
  } catch (error) {
    console.log(
      "❌ Could not open resource page."
    );

    console.log(
      error.message
    );

    throw error;
  }

  if (!opened) {
    return [];
  }

  await waitForPageContent(
    page
  );

  // -------------------------------------------------------
  // Wait for table
  // -------------------------------------------------------

  try {
    await page.waitForSelector(
      TABLE_SELECTOR,
      {
        timeout: 20000
      }
    );

  } catch {
    console.log(
      "⚠️ Table not found."
    );

    return [];
  }

  // -------------------------------------------------------
  // DataTables rows
  // -------------------------------------------------------

  await delay(1500);

  const results = [];

  let pageNumber = 1;

  const seenPageSignatures =
    new Set();

  while (true) {
    console.log(
      `Page ${pageNumber}`
    );

    let rows = [];

    // -----------------------------------------------------
    // Retry scraping current page
    // -----------------------------------------------------

    for (
      let attempt = 1;
      attempt <= MAX_PAGE_RETRIES;
      attempt++
    ) {
      rows =
        await scrapeCurrentPage(
          page
        );

      if (rows.length > 0) {
        break;
      }

      console.log(
        `⚠️ 0 rows. Retry ${attempt}/${MAX_PAGE_RETRIES}`
      );

      await delay(
        2000 * attempt
      );
    }

    console.log(
      `Found ${rows.length}`
    );

    // -----------------------------------------------------
    // Print topics
    // -----------------------------------------------------

    for (
      const row of rows
    ) {
      console.log(
        `   → ${
          row.topic ||
          "[EMPTY TOPIC]"
        }`
      );
    }

    // -----------------------------------------------------
    // Prevent infinite page loop
    // -----------------------------------------------------

    const signature =
      rows
        .map(
          row =>
            row.lessonId ||
            row.url ||
            `${row.topic}-${row.date}-${row.size}`
        )
        .join("|");

    if (
      signature &&
      seenPageSignatures.has(
        signature
      )
    ) {
      console.log(
        "⚠️ Same page detected. Stopping."
      );

      break;
    }

    if (signature) {
      seenPageSignatures.add(
        signature
      );
    }

    // -----------------------------------------------------
    // Add data
    // -----------------------------------------------------

    for (
      const row of rows
    ) {
      results.push({
        ...row,

        requestedSubject:
          subject.name,

        requestedSubjectId:
          subject.sid,

        requestedClass:
          classInfo.name,

        requestedClassId:
          classInfo.cid,

        sourceUrl:
          url
      });
    }

    // -----------------------------------------------------
    // Next page
    // -----------------------------------------------------

    const hasNext =
      await clickNext(
        page
      );

    if (!hasNext) {
      break;
    }

    pageNumber++;

    if (
      pageNumber > 200
    ) {
      console.log(
        "⚠️ Safety page limit reached."
      );

      break;
    }
  }

  console.log("");
  console.log(
    `${subject.name} | ${classInfo.name} COMPLETE`
  );

  console.log(
    `Resources: ${results.length}`
  );

  return results;
}

// =========================================================
// REMOVE DUPLICATES
// =========================================================

function removeDuplicates(
  resources
) {
  const map =
    new Map();

  for (
    const item of resources
  ) {
    let key;

    // Best: lesson ID
    if (item.lessonId) {
      key =
        `lesson-${item.lessonId}`;
    }

    // Second: URL
    else if (item.url) {
      key =
        `url-${item.url}`;
    }

    // Last fallback
    else {
      key =
        JSON.stringify([
          item.requestedSubject ||
            item.subject,

          item.requestedClass ||
            item.class,

          item.topic,

          item.date,

          item.size,

          item.postedBy
        ]);
    }

    if (!map.has(key)) {
      map.set(
        key,
        item
      );
    }
  }

  return [
    ...map.values()
  ];
}

// =========================================================
// ARRANGE BY SUBJECT
// =========================================================

function arrangeBySubject(
  resources
) {
  const subjects = {};

  for (
    const resource of resources
  ) {
    const subjectName =
      resource.requestedSubject ||
      resource.subject ||
      "Unknown";

    const subjectSlug =
      normalizeSubjectName(
        subjectName
      );

    if (
      !subjects[subjectSlug]
    ) {
      subjects[subjectSlug] = {
        id: subjectSlug,

        name:
          subjectName,

        total: 0,

        classes: {
          "SS 1": {
            class: "SS 1",
            total: 0,
            resources: []
          },

          "SS 2": {
            class: "SS 2",
            total: 0,
            resources: []
          },

          "SS 3": {
            class: "SS 3",
            total: 0,
            resources: []
          }
        }
      };
    }

    const className =
      resource.requestedClass ||
      resource.class ||
      "Unknown";

    if (
      !subjects[
        subjectSlug
      ].classes[className]
    ) {
      subjects[
        subjectSlug
      ].classes[className] = {
        class: className,
        total: 0,
        resources: []
      };
    }

    subjects[
      subjectSlug
    ].classes[
      className
    ].resources.push(
      resource
    );

    subjects[
      subjectSlug
    ].classes[
      className
    ].total++;

    subjects[
      subjectSlug
    ].total++;
  }

  return subjects;
}

// =========================================================
// SAVE RESULTS
// =========================================================

function saveResults(
  resources
) {
  const unique =
    removeDuplicates(
      resources
    );

  const arranged =
    arrangeBySubject(
      unique
    );

  const output = {
    source:
      BASE_URL,

    scrapedAt:
      new Date().toISOString(),

    totalScraped:
      resources.length,

    totalUnique:
      unique.length,

    subjects:
      arranged,

    // Keep flat resources too
    resources:
      unique
  };

  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(
      output,
      null,
      2
    ),
    "utf8"
  );

  console.log("");
  console.log(
    "JSON SAVED"
  );

  console.log(
    `Scraped: ${resources.length}`
  );

  console.log(
    `Unique: ${unique.length}`
  );
}

// =========================================================
// PRINT PROGRESS
// =========================================================

function printProgress(
  progress,
  resources
) {
  console.log("");
  console.log(
    "======================================"
  );

  console.log(
    "CURRENT PROGRESS"
  );

  console.log(
    "======================================"
  );

  console.log(
    `Completed jobs: ${progress.completedJobs.length}`
  );

  console.log(
    `Failed jobs: ${progress.failedJobs.length}`
  );

  console.log(
    `Existing resources: ${resources.length}`
  );

  console.log(
    "======================================"
  );
}

// =========================================================
// MAIN
// =========================================================

async function main() {
  console.log("");
  console.log(
    "======================================"
  );

  console.log(
    "FCTEMIS SCRAPER"
  );

  console.log(
    "SS1 + SS2 + SS3"
  );

  console.log(
    "VISIBLE BROWSER MODE"
  );

  console.log(
    START_FRESH
      ? "FRESH START"
      : "RESUME ENABLED"
  );

  console.log(
    "======================================"
  );

  // -------------------------------------------------------
  // Fresh start
  // -------------------------------------------------------

  if (START_FRESH) {
    startFresh();
  }

  // -------------------------------------------------------
  // Load previous data
  // -------------------------------------------------------

  let allResources =
    loadExistingResources();

  const progress =
    loadProgress();

  printProgress(
    progress,
    allResources
  );

  // -------------------------------------------------------
  // Launch browser
  // -------------------------------------------------------

  const browser =
    await puppeteer.launch({
      headless: false,

      defaultViewport: null,

      args: [
        "--start-maximized",
        "--disable-blink-features=AutomationControlled"
      ]
    });

  const page =
    await browser.newPage();

  // -------------------------------------------------------
  // User agent
  // -------------------------------------------------------

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/151.0.0.0 Safari/537.36"
  );

  // -------------------------------------------------------
  // Extra browser settings
  // -------------------------------------------------------

  await page.setExtraHTTPHeaders({
    "Accept-Language":
      "en-US,en;q=0.9"
  });

  // -------------------------------------------------------
  // Collect subjects
  // -------------------------------------------------------

  const allSubjectMap =
    new Map();

  for (
    const classInfo of CLASS_LEVELS
  ) {
    let subjects = [];

    try {
      subjects =
        await getSubjectsForClass(
          page,
          classInfo
        );

    } catch (error) {
      console.log("");
      console.log(
        `⚠️ Could not get subjects for ${classInfo.name}`
      );

      console.log(
        error.message
      );
    }

    for (
      const subject of subjects
    ) {
      const key =
        `${subject.sid}-${normalizeSubjectName(subject.name)}`;

      if (
        !allSubjectMap.has(key)
      ) {
        allSubjectMap.set(
          key,
          {
            sid:
              subject.sid,

            name:
              subject.name
          }
        );
      }
    }
  }

  const subjects =
    [
      ...allSubjectMap.values()
    ];

  console.log("");
  console.log(
    "======================================"
  );

  console.log(
    `TOTAL UNIQUE SUBJECTS: ${subjects.length}`
  );

  console.log(
    "======================================"
  );

  // -------------------------------------------------------
  // IMPORTANT SAFETY CHECK
  // -------------------------------------------------------

  if (!subjects.length) {
    console.log("");
    console.log(
      "❌ NO SUBJECTS WERE FOUND."
    );

    console.log("");
    console.log(
      "The scraper will NOT start scraping."
    );

    console.log(
      "This prevents overwriting your data."
    );

    console.log("");

    console.log(
      "Check these debug files:"
    );

    console.log(
      "debug-subjects-10.png"
    );

    console.log(
      "debug-subjects-10.html"
    );

    await browser.close();

    return;
  }

  // -------------------------------------------------------
  // Scrape every subject and class
  // -------------------------------------------------------

  for (
    const subject of subjects
  ) {
    for (
      const classInfo of CLASS_LEVELS
    ) {
      const jobKey =
        createJobKey(
          subject,
          classInfo
        );

      // ---------------------------------------------------
      // Resume check
      // ---------------------------------------------------

      if (
        !START_FRESH &&
        progress.completedJobs.includes(
          jobKey
        )
      ) {
        console.log("");
        console.log(
          `⏭️ SKIPPING COMPLETED`
        );

        console.log(
          `${subject.name} | ${classInfo.name}`
        );

        continue;
      }

      console.log("");
      console.log(
        "======================================"
      );

      console.log(
        `JOB: ${jobKey}`
      );

      console.log(
        `${subject.name} | ${classInfo.name}`
      );

      console.log(
        "======================================"
      );

      let success =
        false;

      // ---------------------------------------------------
      // Try complete job several times
      // ---------------------------------------------------

      for (
        let attempt = 1;
        attempt <= 3;
        attempt++
      ) {
        try {
          const resources =
            await scrapeSubject(
              page,
              subject,
              classInfo
            );

          allResources.push(
            ...resources
          );

          // Save immediately
          saveResults(
            allResources
          );

          // Mark complete
          markJobComplete(
            progress,
            jobKey
          );

          success = true;

          console.log("");
          console.log(
            `✅ COMPLETED: ${jobKey}`
          );

          break;

        } catch (error) {
          console.log("");
          console.log(
            `⚠️ JOB ERROR`
          );

          console.log(
            `${subject.name} | ${classInfo.name}`
          );

          console.log(
            `Attempt ${attempt}/3`
          );

          console.log(
            error.message
          );

          if (
            attempt < 3
          ) {
            console.log(
              "Waiting before retry..."
            );

            await delay(
              5000 * attempt
            );

            // Reload page before retry
            try {
              await page.goto(
                "about:blank"
              );
            } catch {}
          }
        }
      }

      // ---------------------------------------------------
      // If all attempts failed
      // ---------------------------------------------------

      if (!success) {
        console.log("");
        console.log(
          `❌ FAILED JOB: ${jobKey}`
        );

        markJobFailed(
          progress,
          jobKey
        );

        // Save existing records
        saveResults(
          allResources
        );
      }

      await delay(
        DELAY_BETWEEN_SUBJECTS
      );
    }

    await delay(
      DELAY_BETWEEN_CLASSES
    );
  }

  // -------------------------------------------------------
  // Final save
  // -------------------------------------------------------

  saveResults(
    allResources
  );

  // -------------------------------------------------------
  // Final progress
  // -------------------------------------------------------

  saveProgress(
    progress
  );

  console.log("");
  console.log(
    "======================================"
  );

  console.log(
    "SCRAPING FINISHED"
  );

  console.log(
    "======================================"
  );

  console.log(
    `Total records: ${allResources.length}`
  );

  console.log(
    `Completed jobs: ${progress.completedJobs.length}`
  );

  console.log(
    `Failed jobs: ${progress.failedJobs.length}`
  );

  console.log(
    `Output: ${OUTPUT_FILE}`
  );

  console.log(
    `Progress: ${PROGRESS_FILE}`
  );

  console.log("");

  await browser.close();
}

// =========================================================
// START
// =========================================================

main().catch(
  error => {
    console.log("");
    console.log(
      "======================================"
    );

    console.log(
      "FATAL ERROR"
    );

    console.log(
      "======================================"
    );

    console.error(error);

    console.log("");

    console.log(
      "The progress file has been preserved."
    );

    console.log(
      "Run again with START_FRESH = false to resume."
    );
  }
);