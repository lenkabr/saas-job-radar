# CZ & SK SaaS Job Radar

A job monitoring dashboard that collects open roles from selected Czech and Slovak SaaS and technology companies in one place.

> 🚧 Work in progress — this is the first working version. I'm actively adding more companies, improving source reliability, and expanding the automation.

## Why I built this

I built SaaS Job Radar while looking for my next role.

There are a number of Czech and Slovak SaaS and technology companies I genuinely like and would consider working for, but I couldn't find one place that reliably showed me open positions across all of them.

Existing job boards help, but they only cover part of the market. That left me doing the same thing over and over again: opening dozens of company career pages to see whether anything new had appeared.

So instead of checking them manually every day, I decided to build the tool I wanted for myself.

SaaS Job Radar monitors selected companies, collects their current openings, normalizes the data, stores historical snapshots, and gives me one dashboard where I can see what's open and — importantly — what's new since the previous scan.

It also became a practical way for me to go deeper into Apify, APIs, Node.js and PostgreSQL by building something I actually use.

## Current version

The first version currently:

- monitors 20 selected Czech and Slovak SaaS and technology companies
- collects open positions from multiple source types
- uses Apify's AI Web Scraper for careers pages
- uses structured public APIs where appropriate, including Greenhouse and Workable
- normalizes jobs from different sources into one common format
- stores scrape history in PostgreSQL
- compares the latest company snapshot with the previous one
- identifies newly added roles
- categorizes roles into Product, Engineering, GTM, Customer Success and Other
- filters jobs by company origin, company and team
- displays everything in a simple web dashboard

## How it works

The project uses several ingestion methods because company career sites are not standardized.

For many companies, the careers page is processed using the **Apify AI Web Scraper**. The scraper is instructed to find currently open positions and extract structured information such as:

- job title
- department
- location
- job URL

Some companies expose structured job data through their recruiting platform instead. The project currently also supports:

- **Greenhouse Job Board API**
- **Workable API**

Regardless of the source, jobs are converted into the same internal structure before being saved to PostgreSQL.

Each successful scan creates a new snapshot rather than replacing the previous data. This allows the application to compare the latest snapshot with the previous one and determine which roles are new.

## Tech stack

- Node.js
- Express
- PostgreSQL
- EJS
- Apify
- Apify AI Web Scraper
- Greenhouse Job Board API
- Workable API
- Axios
