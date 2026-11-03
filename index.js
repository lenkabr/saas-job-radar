const axios = require("axios");
const { Pool } = require("pg");
require("dotenv").config();

const companies = require("./companies");

const token = process.env.APIFY_TOKEN;
const actorId = "apify~ai-web-scraper";

const db = new Pool({
  user: "postgres",
  host: "localhost",
  database: "saas_job_radar",
  password: process.env.DB_PASSWORD,
  port: 5432,
});

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Normalize different departments/job titles into our main team categories
function getTeam(department, jobTitle) {
  const text = `${department || ""} ${jobTitle || ""}`.toLowerCase();

  // Product
  if (
    text.includes("product manager") ||
    text.includes("product management") ||
    text.includes("product design") ||
    text.includes("product designer") ||
    text.includes("product owner")
  ) {
    return "Product";
  }

  // Engineering
  if (
    text.includes("engineer") ||
    text.includes("engineering") ||
    text.includes("developer") ||
    text.includes("devops") ||
    text.includes("site reliability") ||
    text.includes("software")
  ) {
    return "Engineering";
  }

  // Customer Success
  if (
    text.includes("customer success") ||
    text.includes("customer experience")
  ) {
    return "Customer Success";
  }

  // GTM
  if (
    text.includes("sales") ||
    text.includes("account executive") ||
    text.includes("account manager") ||
    text.includes("business development") ||
    text.includes("marketing") ||
    text.includes("growth") ||
    text.includes("revenue") ||
    text.includes("partnership") ||
    text.includes("partner manager") ||
    text.includes("gtm")
  ) {
    return "GTM";
  }

  return "Other";
}

// Remove duplicate jobs that have the same URL
function deduplicateJobs(jobs) {
  const uniqueJobs = new Map();

  for (const job of jobs) {
    const jobKey = `${job.company}|${job.jobTitle}|${job.jobUrl}`;

if (!uniqueJobs.has(jobKey)) {
  uniqueJobs.set(jobKey, job);
}
  }

  return Array.from(uniqueJobs.values());
}

function cleanText(value) {
  if (typeof value !== "string") {
    return value;
  }

  return value.replace(/\u0000/g, "");
}

// -------------------------
// WORKABLE
// -------------------------

async function scrapeWorkableCompany(company) {
  console.log(`Fetching ${company.name} jobs from Workable...`);

  const url = `https://www.workable.com/api/accounts/${company.workableSlug}?details=true`;

  const response = await axios.get(url);

  const jobs = response.data.jobs;
  const scrapedAt = new Date().toISOString();

  const normalizedJobs = jobs.map((job) => {
    const department = job.department || null;

    return {
      company: company.name,
      companyCountry: company.country,
      jobTitle: job.title,
      department: department,
      team: getTeam(department, job.title),
      location: job.location?.location_str || job.location || null,
      jobUrl: job.url,
      scrapedAt,
    };
  });

  const uniqueJobs = deduplicateJobs(normalizedJobs);

  console.log(
    `Found ${uniqueJobs.length} unique jobs for ${company.name}.`
  );

  return {
    jobs: uniqueJobs,
    scrapedAt,
  };
}

// -------------------------
// GREENHOUSE
// -------------------------

async function scrapeGreenhouseCompany(company) {
  console.log(`Fetching ${company.name} jobs from Greenhouse...`);

  const url = `https://boards-api.greenhouse.io/v1/boards/${company.greenhouseBoard}/jobs?content=true`;

  const response = await axios.get(url);

  const jobs = response.data.jobs;
  const scrapedAt = new Date().toISOString();

  const normalizedJobs = jobs.map((job) => {
    const department = null;

    return {
      company: company.name,
      companyCountry: company.country,
      jobTitle: job.title,
      department: department,
      team: getTeam(department, job.title),
      location: job.location?.name || null,
      jobUrl: job.absolute_url,
      scrapedAt,
    };
  });

  const uniqueJobs = deduplicateJobs(normalizedJobs);

  console.log(
    `Found ${uniqueJobs.length} unique jobs for ${company.name}.`
  );

  return {
    jobs: uniqueJobs,
    scrapedAt,
  };
}

// -------------------------
// APIFY
// -------------------------

async function scrapeCompany(company) {
  console.log(`Starting scrape for ${company.name}...`);

  const input = {
    startUrls: [
      {
        url: company.careersUrl,
      },
    ],
    extractionMode: "single",
    maxCrawlDepth: 0,
    prompt: `Find all currently open job positions listed on this page.

IMPORTANT:
The jobs may be displayed directly on the careers page rather than on separate job pages.

For every visible open position, extract:
- jobTitle
- department
- location
- jobUrl

If the job title links to an individual job description, use that URL as jobUrl.
Otherwise use the careers page URL.

Do not require an Apply button or separate job page for a position to count as an open job.

Only include actual currently open positions.
Do not include country filters, departments, general careers links, or "send us your resume" sections.
Do not invent information.`,
  };

  const url = `https://api.apify.com/v2/acts/${actorId}/runs?token=${token}`;

  const response = await axios.post(url, input);

  console.log(`${company.name} Actor started!`);
  console.log("Run ID:", response.data.data.id);
  console.log("Dataset ID:", response.data.data.defaultDatasetId);

  const runId = response.data.data.id;
  let status = response.data.data.status;

  while (
    status !== "SUCCEEDED" &&
    status !== "FAILED" &&
    status !== "ABORTED" &&
    status !== "TIMED-OUT"
  ) {
    console.log(`${company.name} status: ${status}`);

    await wait(5000);

    const runResponse = await axios.get(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${token}`
    );

    status = runResponse.data.data.status;
  }

  if (status !== "SUCCEEDED") {
    throw new Error(
      `${company.name} scrape ended with status: ${status}`
    );
  }

  console.log(`${company.name} scrape finished!`);

  const datasetId = response.data.data.defaultDatasetId;

  const datasetResponse = await axios.get(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}`
  );

  const jobs = datasetResponse.data[0].data;
  const scrapedAt = new Date().toISOString();

  const normalizedJobs = jobs.map((job) => {
    return {
      company: company.name,
      companyCountry: company.country,
      jobTitle: job.jobTitle,
      department: job.department,
      team: getTeam(job.department, job.jobTitle),
      location: job.location,
      jobUrl:
  company.name === "Better Stack"
    ? company.careersUrl
    : job.jobUrl,
      scrapedAt,
    };
  });

  const uniqueJobs = deduplicateJobs(normalizedJobs);

  console.log(
    `Found ${uniqueJobs.length} unique jobs for ${company.name}.`
  );

  return {
    jobs: uniqueJobs,
    scrapedAt,
  };
}

// -------------------------
// DATABASE
// -------------------------

async function saveJob(job, scrapeId) {
  await db.query(
    `INSERT INTO jobs
      (
        company,
        company_country,
        job_title,
        department,
        team,
        location,
        job_url,
        scraped_at,
        scrape_id
      )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      cleanText(job.company),
      cleanText(job.companyCountry),
      cleanText(job.jobTitle),
      cleanText(job.department),
      cleanText(job.team),
      cleanText(job.location),
      cleanText(job.jobUrl),
      job.scrapedAt,
      scrapeId,
    ]
  );
}

async function saveScrape(company, scrapedAt) {
  const result = await db.query(
    `INSERT INTO scrapes (company, scraped_at)
     VALUES ($1, $2)
     RETURNING id`,
    [company, scrapedAt]
  );

  return result.rows[0].id;
}

// -------------------------
// RUN FULL BATCH
// -------------------------

async function main() {
 for (const company of companies) {
    try {
      let result;

      if (company.sourceType === "workable") {
        result = await scrapeWorkableCompany(company);
      } else if (company.sourceType === "greenhouse") {
        result = await scrapeGreenhouseCompany(company);
      } else {
        result = await scrapeCompany(company);
      }

      const { jobs, scrapedAt } = result;

      console.log(
        `Job Radar received ${jobs.length} jobs from ${company.name}.`
      );

      const scrapeId = await saveScrape(
        company.name,
        scrapedAt
      );

      console.log(`Created scrape #${scrapeId}.`);

      for (const job of jobs) {
        await saveJob(job, scrapeId);
      }

      console.log(
        `Saved ${jobs.length} jobs from ${company.name}.`
      );
    } catch (error) {
      console.error(
        `❌ ${company.name} failed:`,
        error.message
      );
    }
  }

  console.log("✅ Batch finished.");

  await db.end();
}

main();