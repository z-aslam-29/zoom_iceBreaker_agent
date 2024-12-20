const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { OpenAI } = require("openai");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = express();
const port = 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Bright Data API Configuration
const BRIGHTDATA_API_TOKEN = process.env.BRIGHTDATA_API_TOKEN;
const BRIGHTDATA_TRIGGER_URL =
  "https://api.brightdata.com/datasets/v3/trigger?dataset_id=gd_l1viktl72bvl7bjuj0&include_errors=true";

// OpenAI API Configuration
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.post("/api/trigger", async (req, res) => {
  const { urls } = req.body;

  try {
    // Validate input URLs
    if (!Array.isArray(urls) || urls.length !== 2 || !urls[0].url || !urls[1].url) {
      return res.status(400).json({
        error: "Invalid input. Please provide two valid LinkedIn profile URLs.",
      });
    }

    console.log("Triggering Bright Data with URLs:", urls);

    // Bright Data expects an array of objects with a "url" field
    const payload = urls.map(({ url }) => ({ url }));

    const response = await axios.post(BRIGHTDATA_TRIGGER_URL, payload, {
      headers: {
        Authorization: `Bearer ${BRIGHTDATA_API_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.data.snapshot_id) {
      console.error("No snapshot_id in BrightData response:", response.data);
      return res.status(500).json({ error: "Snapshot ID not returned from BrightData." });
    }

    res.json({ snapshot_id: response.data.snapshot_id });
  } catch (error) {
    console.error("Error triggering BrightData operation:", error.message);
    if (error.response) {
      console.error("BrightData API Error Details:", error.response.data);
    }
    res.status(500).json({ error: error.response?.data?.error || error.message });
  }
});

// Fetch Dataset Snapshot with Retry Logic
const getSnapshotDataWithRetry = async (snapshotId) => {
  const snapshotUrl = `https://api.brightdata.com/datasets/v3/snapshot/${snapshotId}?format=json`;

  let attempts = 0;
  const maxAttempts = 10;
  const retryInterval = 12000;

  var a;

  while (attempts < maxAttempts) {
    try {
      const response = await axios.get(snapshotUrl, {
        headers: {
          Authorization: `Bearer ${BRIGHTDATA_API_TOKEN}`,
        },
      });
      console.log(JSON.stringify(response.data, null, 2));

      if (response.data.status === "running") {
        console.log(
          `Snapshot is still running... Attempt ${attempts + 1}/${maxAttempts}. Retrying in ${retryInterval / 1000} seconds.`
        );
        await new Promise((resolve) => setTimeout(resolve, retryInterval));
      } else {
        a = JSON.stringify(response.data, null, 2);

        // Save snapshot data to a file
        const filePath = path.join(__dirname, "uploads", `${snapshotId}.json`);
        fs.writeFileSync(filePath, a); // Saving data as a JSON file

        break;
      }

      attempts++;
    } catch (error) {
      console.error("Error fetching snapshot data:", error.message);
      if (error.response) {
        console.error("Error response from BrightData snapshot fetch:", error.response.data);
      }
      break;
    }
  }

  return a;
};

// Endpoint to fetch snapshot data with retry
app.get("/api/snapshot/:snapshotId", async (req, res) => {
  const snapshotId = req.params.snapshotId;

  try {
    const snapshotData = await getSnapshotDataWithRetry(snapshotId);

    if (snapshotData) {
      res.json(snapshotData);
    } else {
      res.status(500).json({
        error: "Snapshot data not ready after multiple attempts. Please try again later.",
      });
    }
  } catch (error) {
    console.error("Error fetching snapshot data:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Process Data with GPT-4o-mini
app.post("/api/analyze", async (req, res) => {
  const { snapshotId } = req.body;

  try {
    if (!snapshotId) {
      return res.status(400).json({ error: "Invalid snapshot ID provided for analysis." });
    }

    // Construct the file path to the saved snapshot data
    const filePath = path.join(__dirname, "uploads", `${snapshotId}.json`);

    if (!fs.existsSync(filePath)) {
      return res.status(400).json({ error: "Snapshot file does not exist." });
    }

    // Read the snapshot data from the file
    const fileData = fs.readFileSync(filePath, "utf8");

    const prompt = `
    compare the following LinkedIn profiles based on their education detail , about , city , country , position and provide the following insights:
    1. Common Ground and Points of Connection:
       - Shared Interests
       - Recent Activities
       - Mutual Connections (if any)
       - Similar Career Paths
       - Relevant Details
    2. Suggest casual icebreaker questions that highlight their shared interests and recent activities.

    Profile Data: ${fileData}

    Please structure the output as:
    - Common Ground and Points of Connection
    - Icebreaker Questions
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
    });

    const formattedOutput = response.choices[0].message.content;

    res.json({ insights: formattedOutput });

    // Optionally, delete the file after processing
    fs.unlinkSync(filePath);
  } catch (error) {
    console.error("Error analyzing profiles:", error.message);
    if (error.response) {
      console.error("Error response from OpenAI:", error.response.data);
    }
    res.status(500).json({ error: error.message });
  }
});

// Start Server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
