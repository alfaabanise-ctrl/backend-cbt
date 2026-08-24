const fs = require("fs");
const axios = require("axios");
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.mjs");

const INPUT_FILE = "./fctemis_resources.json";
const OUTPUT_FILE = "./englishnote.json";

const BASE_URL = "https://fctemis.org";

// Number of lessons processed at the same time
const CONCURRENCY = 8;

// Retry failed requests
const MAX_RETRIES = 3;

// Small delay
const DELAY = 300;


// =====================================================
// HELPERS
// =====================================================

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


function cleanText(text) {
    return text
        .replace(/\r/g, "")
        .replace(/[ \t]+/g, " ")
        .replace(/\n\s*\n\s*\n+/g, "\n\n")
        .trim();
}


// =====================================================
// LOAD EXISTING RESULTS
// =====================================================

function loadExistingResults() {

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

        if (!Array.isArray(data)) {
            return [];
        }

        return data;

    } catch (error) {

        console.log(
            "Could not read existing englishnote.json"
        );

        return [];
    }
}


// =====================================================
// SAVE RESULTS
// =====================================================

function saveResults(results) {

    fs.writeFileSync(
        OUTPUT_FILE,
        JSON.stringify(
            results.filter(Boolean),
            null,
            2
        ),
        "utf8"
    );
}


// =====================================================
// GET PDF URL
// =====================================================

async function getPdfUrl(url) {

    const response = await axios.get(url, {

        timeout: 30000,

        headers: {
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36"
        }
    });

    const html = response.data;

    const match = html.match(
        /<object[^>]+data=["']([^"']+\.pdf)["']/i
    );

    if (!match) {

        throw new Error(
            "PDF object not found"
        );
    }

    let pdfUrl = match[1];

    if (pdfUrl.startsWith("http")) {
        return pdfUrl;
    }

    return new URL(
        pdfUrl,
        BASE_URL + "/"
    ).href;
}


// =====================================================
// DOWNLOAD PDF
// =====================================================

async function downloadPdf(pdfUrl) {

    const response = await axios.get(
        pdfUrl,
        {
            responseType: "arraybuffer",

            timeout: 60000,

            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36"
            }
        }
    );

    return Buffer.from(
        response.data
    );
}


// =====================================================
// EXTRACT PDF PAGE BY PAGE
// =====================================================

async function extractPdfPages(buffer) {

    const pdf =
        await pdfjsLib.getDocument({
            data: new Uint8Array(buffer)
        }).promise;

    const pages = [];

    for (
        let pageNumber = 1;
        pageNumber <= pdf.numPages;
        pageNumber++
    ) {

        try {

            const page =
                await pdf.getPage(
                    pageNumber
                );

            const content =
                await page.getTextContent();

            const text =
                content.items
                    .map(
                        item =>
                            item.str || ""
                    )
                    .join(" ");

            pages.push({
                page: pageNumber,
                text: cleanText(text)
            });

        } catch (error) {

            console.log(
                `      Page ${pageNumber} failed`
            );

            pages.push({
                page: pageNumber,
                text: ""
            });
        }
    }

    return pages;
}


// =====================================================
// RETRY FUNCTION
// =====================================================

async function retry(fn, retries = MAX_RETRIES) {

    let lastError;

    for (
        let attempt = 1;
        attempt <= retries;
        attempt++
    ) {

        try {

            return await fn();

        } catch (error) {

            lastError = error;

            console.log(
                `   Retry ${attempt}/${retries}: ${error.message}`
            );

            if (attempt < retries) {

                await sleep(
                    1500 * attempt
                );
            }
        }
    }

    throw lastError;
}


// =====================================================
// PROCESS ONE LESSON
// =====================================================

async function processLesson(
    resource,
    position,
    total
) {

    console.log("");
    console.log(
        "=========================================="
    );

    console.log(
        `Processing ${position}/${total}`
    );

    console.log(
        `Lesson ID: ${resource.lessonId}`
    );

    console.log(
        `Subject: ${resource.subject}`
    );

    console.log(
        `Topic: ${resource.topic}`
    );

    console.log(
        "=========================================="
    );


    try {

        const lessonUrl =
            resource.url ||
            `${BASE_URL}/print_lesson_note2?lid=${resource.lessonId}`;


        console.log(
            "Opening:"
        );

        console.log(
            lessonUrl
        );


        // -----------------------------------------
        // GET PDF
        // -----------------------------------------

        const pdfUrl =
            await retry(
                () =>
                    getPdfUrl(
                        lessonUrl
                    )
            );


        console.log(
            "PDF:"
        );

        console.log(
            pdfUrl
        );


        // -----------------------------------------
        // DOWNLOAD
        // -----------------------------------------

        const pdfBuffer =
            await retry(
                () =>
                    downloadPdf(
                        pdfUrl
                    )
            );


        console.log(
            `Downloaded ${(pdfBuffer.length / 1024).toFixed(1)} KB`
        );


        // -----------------------------------------
        // EXTRACT
        // -----------------------------------------

        const pages =
            await extractPdfPages(
                pdfBuffer
            );


        const rawText =
            pages
                .map(
                    page =>
                        page.text
                )
                .filter(Boolean)
                .join("\n\n");


        console.log(
            `Pages: ${pages.length}`
        );

        console.log(
            `Text: ${rawText.length} characters`
        );


        // -----------------------------------------
        // RESULT
        // -----------------------------------------

        return {

            source: "fctemis",

            url: lessonUrl,

            title:
                resource.topic ||
                "",

            class:
                resource.class ||
                "SS 1",

            subject:
                "English Language",

            term:
                resource.term ||
                "",

            rawText,

            pages
        };


    } catch (error) {

        console.log("");

        console.log(
            `❌ FAILED ${resource.lessonId}`
        );

        console.log(
            error.message
        );


        return {

            source: "fctemis",

            url:
                resource.url ||
                `${BASE_URL}/print_lesson_note2?lid=${resource.lessonId}`,

            lessonId:
                resource.lessonId,

            title:
                resource.topic ||
                "",

            class:
                resource.class ||
                "SS 1",

            subject:
                "English Language",

            term:
                resource.term ||
                "",

            rawText: "",

            pages: [],

            error:
                error.message
        };
    }
}


// =====================================================
// MAIN
// =====================================================

async function main() {

    console.log("");
    console.log(
        "=========================================="
    );

    console.log(
        "FCTEMIS ENGLISH SCRAPER"
    );

    console.log(
        "RESUME MODE"
    );

    console.log(
        "=========================================="
    );


    // =================================================
    // LOAD INPUT
    // =================================================

    if (!fs.existsSync(INPUT_FILE)) {

        console.log(
            `❌ ${INPUT_FILE} not found`
        );

        process.exit(1);
    }


    const data =
        JSON.parse(
            fs.readFileSync(
                INPUT_FILE,
                "utf8"
            )
        );


    // =================================================
    // COLLECT RESOURCES
    // =================================================

    const resources = [];


    function collect(node) {

        if (!node) {
            return;
        }


        if (Array.isArray(node)) {

            for (const item of node) {

                collect(item);
            }

            return;
        }


        if (
            typeof node === "object"
        ) {

            if (
                node.lessonId &&
                node.url &&
                node.subject
            ) {

                resources.push(node);
            }


            for (
                const value of
                Object.values(node)
            ) {

                collect(value);
            }
        }
    }


    collect(data);


    // =================================================
    // ENGLISH ONLY
    // =================================================

    const english =
        resources.filter(
            item =>
                String(
                    item.subject
                )
                    .trim()
                    .toUpperCase() ===
                "ENGLISH"
        );


    // =================================================
    // REMOVE DUPLICATES
    // =================================================

    const uniqueMap =
        new Map();


    for (
        const item of english
    ) {

        const id =
            String(
                item.lessonId
            );


        if (
            !uniqueMap.has(id)
        ) {

            uniqueMap.set(
                id,
                item
            );
        }
    }


    const uniqueEnglish =
        [...uniqueMap.values()];


    // =================================================
    // LOAD OLD RESULTS
    // =================================================

    const existing =
        loadExistingResults();


    // =================================================
    // CREATE COMPLETED SET
    // =================================================

    const completed =
        new Map();


    for (
        const item of existing
    ) {

        if (
            item.lessonId
        ) {

            completed.set(
                String(
                    item.lessonId
                ),
                item
            );
        }
    }


    // =================================================
    // IMPORTANT:
    // REMOVE ONLY SUCCESSFULLY SCRAPED LESSONS
    // =================================================

    const remaining =
        uniqueEnglish.filter(
            item => {

                const old =
                    completed.get(
                        String(
                            item.lessonId
                        )
                    );


                // If old result has text,
                // skip it.

                if (
                    old &&
                    old.rawText &&
                    old.rawText.length > 0
                ) {

                    return false;
                }


                return true;
            }
        );


    // =================================================
    // STATISTICS
    // =================================================

    console.log("");

    console.log(
        `All resources: ${resources.length}`
    );

    console.log(
        `English lessons: ${uniqueEnglish.length}`
    );

    console.log(
        `Already completed: ${completed.size}`
    );

    console.log(
        `Remaining: ${remaining.length}`
    );


    if (
        remaining.length === 0
    ) {

        console.log("");

        console.log(
            "🎉 EVERYTHING IS ALREADY SCRAPED."
        );

        return;
    }


    console.log("");

    console.log(
        `Running ${CONCURRENCY} workers...`
    );


    // =================================================
    // WORK QUEUE
    // =================================================

    let currentIndex = 0;


    async function worker(workerId) {

        while (true) {

            const index =
                currentIndex++;


            if (
                index >=
                remaining.length
            ) {

                return;
            }


            const resource =
                remaining[index];


            // Find original position
            const originalIndex =
                uniqueEnglish.findIndex(
                    x =>
                        String(
                            x.lessonId
                        ) ===
                        String(
                            resource.lessonId
                        )
                );


            const result =
                await processLesson(
                    resource,

                    originalIndex + 1,

                    uniqueEnglish.length
                );


            // =========================================
            // SAVE IMMEDIATELY
            // =========================================

            completed.set(
                String(
                    resource.lessonId
                ),
                result
            );


            saveResults(
                [...completed.values()]
            );


            console.log("");

            console.log(
                `💾 Saved lesson ${resource.lessonId}`
            );


            await sleep(
                DELAY
            );
        }
    }


    // =================================================
    // START WORKERS
    // =================================================

    const workers = [];


    for (
        let i = 0;
        i < CONCURRENCY;
        i++
    ) {

        workers.push(
            worker(i + 1)
        );
    }


    await Promise.all(
        workers
    );


    // =================================================
    // FINAL SAVE
    // =================================================

    saveResults(
        [...completed.values()]
    );


    console.log("");

    console.log(
        "=========================================="
    );

    console.log(
        "SCRAPING FINISHED"
    );

    console.log(
        "=========================================="
    );

    console.log(
        `English lessons: ${uniqueEnglish.length}`
    );

    console.log(
        `Saved: ${completed.size}`
    );

    console.log(
        `File: ${OUTPUT_FILE}`
    );
}


main().catch(error => {

    console.error(
        "FATAL ERROR:"
    );

    console.error(
        error
    );

    process.exit(1);
});