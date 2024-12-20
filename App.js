import React, { useState } from "react";
import axios from "axios";
import "./index.css";

function App() {
  const [url1, setUrl1] = useState("");
  const [url2, setUrl2] = useState("");
  const [insights, setInsights] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleAnalyze = async () => {
    setLoading(true);
    setError("");
    setInsights("");

    try {
      // Trigger API to get snapshot ID
      const triggerResponse = await axios.post("http://localhost:5000/api/trigger", {
        urls: [{ url: url1 }, { url: url2 }],
      });

      const snapshotId = triggerResponse.data.snapshot_id;
      if (!snapshotId) {
        throw new Error("Snapshot ID not found.");
      }

      // Fetch snapshot data with retry logic
      const snapshotResponse = await axios.get(`http://localhost:5000/api/snapshot/${snapshotId}`);
      if (!snapshotResponse.data) {
        throw new Error("Failed to retrieve snapshot data.");
      }

      // Send snapshot ID to the analyze API
      const analysisResponse = await axios.post("http://localhost:5000/api/analyze", {
        snapshotId, // Send the snapshot ID instead of profile data
      });

      // Extract and display insights
      if (analysisResponse.data && analysisResponse.data.insights) {
        setInsights(analysisResponse.data.insights);
      } else {
        throw new Error("Failed to retrieve insights from OpenAI.");
      }
    } catch (error) {
      console.error("Error analyzing profiles:", error.message);
      setError(error.message || "An error occurred while analyzing the profiles.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="App">
      <h1>Zoom Icebreaker AI Agent</h1>
      <input
        type="text"
        placeholder="Enter Your LinkedIn Profile URL"
        value={url1}
        onChange={(e) => setUrl1(e.target.value)}
      />
      <input
        type="text"
        placeholder="Enter Other Person LinkedIn Profile URL"
        value={url2}
        onChange={(e) => setUrl2(e.target.value)}
      />
      <button onClick={handleAnalyze} disabled={loading || !url1 || !url2}>
        {loading ? "Analyzing..." : "Analyze"}
      </button>

      {error && <div className="error">{error}</div>}

      {insights && (
        <div className="insights">
          <h2>Points of Connection</h2>
          <pre>{insights}</pre>
        </div>
      )}
    </div>
  );
}

export default App;
