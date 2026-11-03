const express = require("express");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
const port = 3000;

app.set("view engine", "ejs");

const db = new Pool({
  user: "postgres",
  host: "localhost",
  database: "saas_job_radar",
  password: process.env.DB_PASSWORD,
  port: 5432,
});

// -------------------------
// HOME PAGE
// -------------------------

app.get("/", async (req, res) => {
  const country = req.query.country;
  const company = req.query.company;
  const team = req.query.team;

  /*
    1. Rank every company's scrapes:
       1 = latest
       2 = previous

    2. Show jobs from the latest scrape.

    3. Check whether the same company + title + URL
       existed in the previous scrape.

    4. If it didn't, mark the job as NEW.
  */

  let query = `
    WITH ranked_scrapes AS (
      SELECT
        id,
        company,
        ROW_NUMBER() OVER (
          PARTITION BY company
          ORDER BY id DESC
        ) AS scrape_rank
      FROM scrapes
    ),

    latest_scrapes AS (
      SELECT
        id,
        company
      FROM ranked_scrapes
      WHERE scrape_rank = 1
    ),

    previous_scrapes AS (
      SELECT
        id,
        company
      FROM ranked_scrapes
      WHERE scrape_rank = 2
    )

    SELECT
      j.*,

      CASE
        WHEN previous_scrape.id IS NULL THEN FALSE

        WHEN EXISTS (
          SELECT 1
          FROM jobs previous_job
          WHERE previous_job.scrape_id = previous_scrape.id
            AND previous_job.company = j.company
            AND previous_job.job_title = j.job_title
            AND previous_job.job_url = j.job_url
        )
        THEN FALSE

        ELSE TRUE
      END AS is_new

    FROM jobs j

    JOIN latest_scrapes latest_scrape
      ON j.scrape_id = latest_scrape.id

    LEFT JOIN previous_scrapes previous_scrape
      ON j.company = previous_scrape.company
  `;

  const conditions = [];
  const values = [];

  if (country) {
    values.push(country);
    conditions.push(`j.company_country = $${values.length}`);
  }

  if (company) {
    values.push(company);
    conditions.push(`j.company = $${values.length}`);
  }

  if (team) {
    values.push(team);
    conditions.push(`j.team = $${values.length}`);
  }

  if (conditions.length > 0) {
    query += " WHERE " + conditions.join(" AND ");
  }

  query += `
    ORDER BY
      is_new DESC,
      j.company,
      j.job_title
  `;

  const result = await db.query(query, values);
  const jobs = result.rows;

  // -------------------------
  // FILTER OPTIONS
  // -------------------------

  const countriesResult = await db.query(`
    SELECT DISTINCT company_country
    FROM jobs
    WHERE company_country IS NOT NULL
    ORDER BY company_country
  `);

  let companiesResult;

  if (country) {
    companiesResult = await db.query(
      `
      SELECT DISTINCT company
      FROM jobs
      WHERE company_country = $1
      ORDER BY company
      `,
      [country]
    );
  } else {
    companiesResult = await db.query(`
      SELECT DISTINCT company
      FROM jobs
      ORDER BY company
    `);
  }

  const teamsResult = await db.query(`
    SELECT DISTINCT team
    FROM jobs
    WHERE team IS NOT NULL
    ORDER BY team
  `);

  // -------------------------
  // NEW-JOB SUMMARY
  // -------------------------

  const newJobs = jobs.filter((job) => job.is_new);

  const newJobsByCompany = {};

  for (const job of newJobs) {
    if (!newJobsByCompany[job.company]) {
      newJobsByCompany[job.company] = 0;
    }

    newJobsByCompany[job.company]++;
  }

  const newJobsByTeam = {};

  for (const job of newJobs) {
    if (!newJobsByTeam[job.team]) {
      newJobsByTeam[job.team] = 0;
    }

    newJobsByTeam[job.team]++;
  }
const previousScanResult = await db.query(`
  WITH ranked_scrapes AS (
    SELECT
      scraped_at,
      company,
      ROW_NUMBER() OVER (
        PARTITION BY company
        ORDER BY id DESC
      ) AS scrape_rank
    FROM scrapes
  )
  SELECT MAX(scraped_at) AS previous_scan_at
  FROM ranked_scrapes
  WHERE scrape_rank = 2
`);

const previousScanAt =
  previousScanResult.rows[0].previous_scan_at;

  res.render("index", {
    jobs: jobs,

    countries: countriesResult.rows,
    companies: companiesResult.rows,
    teams: teamsResult.rows,

    selectedCountry: country,
    selectedCompany: company,
    selectedTeam: team,

    newJobsCount: newJobs.length,
    newJobsByCompany: newJobsByCompany,
    newJobsByTeam: newJobsByTeam,
    previousScanAt: previousScanAt,
  });
});

// -------------------------
// JOBS API
// -------------------------

app.get("/jobs", async (req, res) => {
  const result = await db.query(`
    SELECT j.*
    FROM jobs j

    JOIN (
      SELECT company, MAX(id) AS latest_scrape_id
      FROM scrapes
      GROUP BY company
    ) latest
      ON j.scrape_id = latest.latest_scrape_id

    ORDER BY j.company, j.job_title
  `);

  res.json(result.rows);
});

// -------------------------
// START SERVER
// -------------------------

app.listen(port, () => {
  console.log(
  `CZ & SK SaaS Job Radar running at http://localhost:${port}`
);
});