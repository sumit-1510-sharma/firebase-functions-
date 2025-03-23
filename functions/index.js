const functions = require("firebase-functions/v2"); // Correct import for v2
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();
const storage = admin.storage();

async function clearExpiredSlots(db, storage) {
  const now = new Date();

  try {
    const slotsRef = db.collection("slots");
    const snapshot = await slotsRef.where("expires_at", "<=", now).get();

    if (snapshot.empty) {
      console.log("No expired slots found.");
      return;
    }

    console.log(`Found ${snapshot.size} expired slots. Processing...`);
    const batch = db.batch();

    for (const doc of snapshot.docs) {
      const slotData = doc.data();
      console.log(`Processing slot: ${doc.id}`);

      // Delete image if it exists
      if (slotData.imageURL) {
        const filePath = extractFilePathFromURL(slotData.imageURL);
        if (filePath) {
          try {
            await storage.bucket().file(filePath).delete();
            console.log("Deleted expired image.");
          } catch (err) {
            console.error("Error deleting image:", err);
          }
        }
      }

      // Delete associated like_ids
      const likeIdsRef = doc.ref.collection("like_ids");
      const likeIdsSnapshot = await likeIdsRef.get();
      for (const likeDoc of likeIdsSnapshot.docs) {
        batch.delete(likeDoc.ref);
      }

      // Delete associated view_ids
      const viewIdsRef = doc.ref.collection("view_ids");
      const viewIdsSnapshot = await viewIdsRef.get();
      for (const viewDoc of viewIdsSnapshot.docs) {
        batch.delete(viewDoc.ref);
      }

      // Reset slot data
      batch.update(doc.ref, {
        imageURL: "",
        likes: 0,
        views: 0,
        booked_by: null,
        status: "available",
        expires_at: null,
        updated_at: new Date(),
      });
    }

    await batch.commit();
    console.log("Expired slots cleared successfully.");
  } catch (error) {
    console.error("Error clearing expired slots:", error);
  }
}

// const functions = require("firebase-functions");
// const admin = require("firebase-admin");
const { CloudTasksClient } = require("@google-cloud/tasks");

// admin.initializeApp();
const tasksClient = new CloudTasksClient();

// const PROJECT_ID = "panoslice-web-version";
// const QUEUE_NAME = "cleanup-queue";
// const LOCATION = "us-central1"; // Change based on your region

const PROJECT_ID = "found-bd6b0";
const QUEUE_NAME = "cleanup-queue";
const LOCATION = "us-central1"; // Change based on your region

async function scheduleNextRun() {
  const queuePath = tasksClient.queuePath(PROJECT_ID, LOCATION, QUEUE_NAME);

  const payload = {
    httpRequest: {
      httpMethod: "POST",
      url: `https://us-central1-${PROJECT_ID}.cloudfunctions.net/cleanupExpiredData`,
      headers: { "Content-Type": "application/json" },
    },
    scheduleTime: {
      seconds: Math.floor(Date.now() / 1000) + 5, // Run after 10 seconds
    },
  };

  await tasksClient.createTask({ parent: queuePath, task: payload });
}

exports.cleanupExpiredData = functions.https.onRequest(async (req, res) => {
  console.log("Cleaning up expired data...");

  // Your logic to clear expired slots and storage
  await clearExpiredSlots(db, storage);

  // Schedule next run
  await scheduleNextRun();

  res.status(200).send("Cleanup done, next run scheduled.");
});

// Helper function to extract the file path from a Firebase Storage URL
function extractFilePathFromURL(url) {
  try {
    const decodedURL = decodeURIComponent(url);
    const match = decodedURL.match(/\/o\/(.*?)\?/);
    return match ? match[1] : null;
  } catch (error) {
    console.error("Error extracting file path:", error);
    return null;
  }
}

exports.resetStreaks = functions.scheduler.onSchedule(
  "every day 00:00",
  async (event) => {
    const now = admin.firestore.Timestamp.now();
    const oneDayAgo = new admin.firestore.Timestamp(
      now.seconds - 24 * 60 * 60, // Subtract 24 hours
      now.nanoseconds
    );

    try {
      const usersRef = db.collection("users");
      const snapshot = await usersRef
        .where("last_upload", "<=", oneDayAgo)
        .get();

      if (snapshot.empty) {
        console.log("✅ No streaks to reset.");
        return null;
      }

      console.log(`⚡ Resetting streaks for ${snapshot.size} users...`);
      const batch = db.batch();

      snapshot.forEach((doc) => {
        batch.update(doc.ref, { streaks: 0 });
      });

      await batch.commit();
      console.log("✅ Streaks reset successfully.");
    } catch (error) {
      console.error("❌ Error resetting streaks:", error);
    }

    return null;
  }
);
