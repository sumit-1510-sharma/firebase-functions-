const functions = require("firebase-functions/v2"); // Correct import for v2
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();
const storage = admin.storage();

// Scheduled function to clear expired slots every minute
exports.clearExpiredSlots = functions.scheduler.onSchedule(
  "every 1 minutes",
  async (event) => {
    const now = admin.firestore.Timestamp.now(); // Get current Firestore timestamp
    const nowMillis = now.toMillis(); // Convert to milliseconds if needed

    try {
      const slotsRef = db.collection("slots");

      // Fetch expired slots (modify depending on how expires_at is stored)
      const snapshot = await slotsRef
        .where("expires_at", "<=", nowMillis)
        .get();

      if (snapshot.empty) {
        console.log("✅ No expired slots found.");
        return null;
      }

      console.log(`⚡ Found ${snapshot.size} expired slots. Processing...`);
      const batch = db.batch(); // Use batch for multiple updates

      for (const doc of snapshot.docs) {
        const slotData = doc.data();
        console.log(`🔄 Processing slot: ${doc.id}`);

        // Remove image from Firebase Storage if it exists
        if (slotData.imageURL) {
          const filePath = extractFilePathFromURL(slotData.imageURL);
          if (filePath) {
            try {
              await storage.bucket().file(filePath).delete();
              console.log(`🗑️ Deleted expired image: ${filePath}`);
            } catch (err) {
              console.error("❌ Error deleting image:", err);
            }
          }
        }

        // Reset slot fields
        batch.update(doc.ref, {
          imageURL: "",
          booked_by: "",
          status: "available",
          updated_at: admin.firestore.Timestamp.now(),
        });
      }

      await batch.commit(); // Execute batch update
      console.log("✅ Expired slots cleared successfully.");
    } catch (error) {
      console.error("❌ Error clearing expired slots:", error);
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
    console.error("❌ Error extracting file path:", error);
    return null;
  }
}

exports.resetStreaks = functions.scheduler.onSchedule(
  "every day 00:00", // Runs at midnight daily
  async (event) => {
    const now = admin.firestore.Timestamp.now();
    const oneDayAgo = new Date(now.toMillis() - 24 * 60 * 60 * 1000); // 24 hours ago

    try {
      const usersRef = db.collection("users");
      const snapshot = await usersRef
        .where(
          "last_upload",
          "<=",
          admin.firestore.Timestamp.fromDate(oneDayAgo)
        )
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
