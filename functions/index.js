const functions = require("firebase-functions/v2"); // Correct import for v2
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();
const storage = admin.storage();

exports.clearExpiredSlots = functions.scheduler.onSchedule(
  "every 1 minutes",
  async (event) => {
    const now = admin.firestore.Timestamp.now();

    try {
      const slotsRef = db.collection("slots");

      const snapshot = await slotsRef
        .where("expires_at", "<=", now)
        // .where("status", "==", "booked")
        .get();

      if (snapshot.empty) {
        console.log("No expired slots found.");
        return null;
      }

      console.log(`Found ${snapshot.size} expired slots. Processing...`);
      const batch = db.batch();

      for (const doc of snapshot.docs) {
        const slotData = doc.data();
        console.log(`Processing slot: ${doc.id}`);

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

        const likeIdsRef = doc.ref.collection("like_ids");
        const likeIdsSnapshot = await likeIdsRef.get();
        for (const likeDoc of likeIdsSnapshot.docs) {
          batch.delete(likeDoc.ref);
        }

        batch.update(doc.ref, {
          imageURL: "",
          likes: 0,
          views: 0,
          booked_by: null,
          status: "available",
          expires_at: null,
          updated_at: admin.firestore.Timestamp.now(),
        });
      }

      await batch.commit();
      console.log("Expired slots cleared successfully.");
    } catch (error) {
      console.error("Error clearing expired slots:", error);
    }

    return null;
  }
);

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
