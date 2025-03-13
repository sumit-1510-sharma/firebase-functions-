import { useEffect, useState } from "react";
import { db, storage, auth } from "./firebase"; // Import Firebase setup
import {
  doc,
  deleteDoc,
  getDoc,
  increment,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  getFirestore,
  collection,
  getDocs,
  onSnapshot,
  updateDoc,
} from "firebase/firestore";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  uploadBytesResumable,
  deleteObject,
} from "firebase/storage";
import { deleteUser } from "firebase/auth";
import "./App.css";

function App() {
  const [slot, setSlot] = useState("");
  const [image, setImage] = useState(null);
  const [message, setMessage] = useState("");
  const [slots, setSlots] = useState([]);
  const userId = "A1B2C3D4E5F6G7H8I9J0";

  const createUser = async (userId, username, name, bio, website, file) => {
    if (!userId || !username || !name) {
      return { success: false, message: "Missing required fields." };
    }

    const userRef = doc(db, "users", userId);

    try {
      // Upload profile image (if provided)
      const imageUrl = file ? await uploadProfileImage(userId, file) : null;

      // User data to be stored in Firestore
      const userData = {
        username,
        name,
        bio: bio || "",
        website: website || "",
        cooldown: null, // Initial cooldown
        last_upload: null, // Initial last upload
        profile_views: 0,
        streaks: 0,
        total_likes: 0,
        profile_imageURL: imageUrl,
      };

      await setDoc(userRef, userData);
      return { success: true, message: "User created successfully!", userData };
    } catch (error) {
      console.error("❌ Error creating user:", error.message);
      return { success: false, message: error.message };
    }
  };

  const uploadProfileImage = async (userId, file) => {
    if (!file) return null;

    const filePath = `profile_pictures/${userId}`;
    const fileRef = ref(storage, filePath);

    try {
      const uploadTask = await uploadBytesResumable(fileRef, file);
      return await getDownloadURL(uploadTask.ref);
    } catch (error) {
      console.error("❌ Error uploading profile image:", error.message);
      return null;
    }
  };

  const bookSlot = async (slot, userId) => {
    const slotRef = doc(db, "slots", slot);
    const userRef = doc(db, "users", userId);

    try {
      const result = await runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists()) {
          throw new Error("User does not exist.");
        }

        const userData = userDoc.data();

        const now = Date.now();
        const cooldownTime = userData.cooldown?.toMillis() || 0;

        if (now < cooldownTime) {
          throw new Error("You are on cooldown. Try again later.");
        }

        const slotData = (await transaction.get(slotRef)).data();

        if (slotData.status !== "available") {
          throw new Error("Slot is already booked.");
        }

        transaction.update(slotRef, {
          booked_by: userRef,
          status: "processing",
        });

        const newCooldown = new Date(now + 5 * 60 * 1000);
        transaction.update(userRef, {
          cooldown: newCooldown,
        });

        return { success: true, message: "Slot booked successfully!" };
      });

      return result;
    } catch (error) {
      return { success: false, message: error.message };
    }
  };

  const uploadImage = async (slot, userId, file) => {
    if (!file) {
      return { success: false, message: "No file selected for upload." };
    }

    const slotRef = doc(db, "slots", slot);
    const userRef = doc(db, "users", userId);
    const filePath = `uploads/${slot}/${Date.now()}`;
    const fileRef = ref(storage, filePath);

    try {
      const uploadTask = await uploadBytesResumable(fileRef, file);
      const imageUrl = await getDownloadURL(uploadTask.ref);

      await runTransaction(db, async (transaction) => {
        const expiresAt = Timestamp.fromDate(
          new Date(Date.now() + 60 * 60 * 1000)
        );
        const cooldownEnd = Timestamp.fromDate(
          new Date(Date.now() + 60 * 60 * 1000)
        );

        transaction.update(slotRef, {
          expires_at: expiresAt,
          imageURL: imageUrl,
          status: "booked",
          updated_at: serverTimestamp(),
        });

        transaction.update(userRef, {
          streaks: increment(1),
          last_upload: serverTimestamp(),
          cooldown: cooldownEnd,
        });
      });

      return {
        success: true,
        message: "Image uploaded, streak increased & cooldown applied",
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  };

  const resetSlot = async (slot) => {
    const slotRef = doc(db, "slots", slot);

    try {
      await runTransaction(db, async (transaction) => {
        transaction.update(slotRef, {
          booked_by: null,
          status: "available",
        });
      });

      console.log("✅ Slot reset successfully.");
    } catch (error) {
      console.error("❌ Error resetting slot:", error);
    }
  };

  const likeImage = async (slot, userId) => {
    const slotRef = doc(db, "slots", slot);
    const likeRef = doc(db, "slots", slot, "like_ids", userId);

    try {
      await runTransaction(db, async (transaction) => {
        const slotDoc = await transaction.get(slotRef, {
          fieldMask: ["booked_by"],
        });

        const bookedByRef = slotDoc.data().booked_by;

        if (!bookedByRef) {
          throw new Error("No user found for this slot.");
        }

        const likeDoc = await transaction.get(likeRef);
        if (likeDoc.exists()) {
          throw new Error("User has already liked this image.");
        }

        transaction.set(likeRef, {});

        transaction.update(slotRef, {
          likes: increment(1),
        });

        transaction.update(bookedByRef, {
          total_likes: increment(1),
        });
      });

      console.log("✅ Image liked successfully!");
      return { success: true, message: "Image liked successfully!" };
    } catch (error) {
      console.error("❌ Error liking image:", error.message);
      return { success: false, message: error.message };
    }
  };

  const unlikeImage = async (slot, userId) => {
    const slotRef = doc(db, "slots", slot);
    const likeRef = doc(db, "slots", slot, "like_ids", userId);

    try {
      await runTransaction(db, async (transaction) => {
        // Fetch only the `booked_by` field
        const slotDoc = await transaction.get(slotRef, {
          fieldMask: ["booked_by"],
        });

        const bookedByRef = slotDoc.data().booked_by; // Get only the `booked_by` reference

        if (!bookedByRef) {
          throw new Error("No user found for this slot.");
        }

        const likeDoc = await transaction.get(likeRef);
        if (!likeDoc.exists()) {
          throw new Error("User has not liked this image.");
        }

        // Remove the like document
        transaction.delete(likeRef);

        // Decrement likes count in slot document
        transaction.update(slotRef, {
          likes: increment(-1),
        });

        // Decrement total likes in the user document (owner of the image)
        transaction.update(bookedByRef, {
          total_likes: increment(-1),
        });
      });

      console.log("✅ Image unliked successfully!");
      return { success: true, message: "Image unliked successfully!" };
    } catch (error) {
      console.error("❌ Error unliking image:", error.message);
      return { success: false, message: error.message };
    }
  };

  const incrementViewCount = async (slot) => {
    const slotRef = doc(db, "slots", slot);

    try {
      await runTransaction(db, async (transaction) => {
        transaction.update(slotRef, {
          views: increment(1),
        });
      });

      console.log("View count increased successfully!");
    } catch (error) {
      console.error("Error increasing view count:", error.message);
    }
  };

  const hasUserLikedSlot = async (slot, userId) => {
    try {
      const likeDocRef = doc(db, "slots", slot, "like_ids", userId);
      const likeDocSnap = await getDoc(likeDocRef);

      return likeDocSnap.exists();
    } catch (error) {
      console.error("Error checking like status:", error);
      return false;
    }
  };

  const incrementProfileViewCount = async (userId) => {
    const userRef = doc(db, "users", userId);

    try {
      await runTransaction(db, async (transaction) => {
        transaction.update(userRef, {
          profile_views: increment(1),
        });
      });

      console.log("Profile view count increased successfully!");
    } catch (error) {
      console.error("Error increasing profile view count:", error.message);
    }
  };

  // delete user and its data

  const deleteProfileImage = async (imageURL) => {
    if (!imageURL) return;

    try {
      const fileRef = ref(storage, imageURL);
      await deleteObject(fileRef);
      console.log("Profile image deleted successfully.");
    } catch (error) {
      console.error("Error deleting profile image:", error.message);
    }
  };

  const resetUserSlot = async (userId) => {
    const slotsCollection = collection(db, "slots");
    const q = query(
      slotsCollection,
      where("booked_by", "==", doc(db, "users", userId))
    );

    try {
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const slotDoc = querySnapshot.docs[0]; // Get the first (and only) slot
        const slotRef = doc(db, "slots", slotDoc.id);

        await updateDoc(slotRef, {
          booked_by: null,
          status: "available",
          imageURL: "",
          updated_at: null,
          expires_at: null,
          likes: 0,
          views: 0,
        });

        console.log(`✅ Slot ${slotDoc.id} reset successfully.`);
      }
    } catch (error) {
      console.error("❌ Error resetting slot:", error.message);
    }
  };

  const deleteUserAccount = async (userId) => {
    const userRef = doc(db, "users", userId);

    try {
      // Step 1: Get user document
      const userDoc = await getDocs(userRef);
      if (!userDoc.exists()) {
        throw new Error("User does not exist.");
      }

      const userData = userDoc.data();
      const profileImageURL = userData.profile_imageURL;

      // Step 2: Delete profile image
      await deleteProfileImage(profileImageURL);

      // Step 3: Reset slots where user has posted
      await resetUserSlot(userId);

      // Step 4: Delete user document from Firestore
      await deleteDoc(userRef);
      console.log("User deleted from Firestore.");

      // Step 5: Delete user from Firebase Authentication
      const user = auth.currentUser;
      if (user && user.uid === userId) {
        await deleteUser(user);
        console.log("User deleted from Firebase Authentication.");
      } else {
        throw new Error(
          "Cannot delete user from authentication (user must be logged in)."
        );
      }

      return { success: true, message: "User deleted successfully!" };
    } catch (error) {
      console.error("Error deleting user:", error.message);
      return { success: false, message: error.message };
    }
  };

  //  listen to slots in real-time

  const listenToSlotsWithUsersOptimized = (db, setSlots) => {
    const slotsCollection = collection(db, "slots");

    const unsubscribe = onSnapshot(slotsCollection, async (snapshot) => {
      const slots = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // Step 1: Extract unique user references from slots
      const userRefs = [
        ...new Set(slots.map((slot) => slot.booked_by?.id).filter(Boolean)),
      ];

      if (userRefs.length === 0) {
        setSlots(slots.map((slot) => ({ ...slot, user: null }))); // No users to fetch
        return;
      }

      // Step 2: Batch fetch user documents in one query
      const usersCollection = collection(db, "users");
      const usersQuery = query(
        usersCollection,
        where("__name__", "in", userRefs)
      );

      const usersSnapshot = await getDocs(usersQuery);
      const usersMap = {};
      usersSnapshot.docs.forEach((doc) => {
        usersMap[doc.id] = { id: doc.id, ...doc.data() };
      });

      // Step 3: Merge user data with slots
      const slotsWithUsers = slots.map((slot) => ({
        ...slot,
        user: slot.booked_by ? usersMap[slot.booked_by.id] || null : null,
      }));

      console.log(slotsWithUsers);
      setSlots(slotsWithUsers);
    });

    return unsubscribe;
  };

  useEffect(() => {
    const unsubscribe = listenToSlotsWithUsersOptimized(db, setSlots);
    return () => unsubscribe();
  }, []);

  return (
    <div className="container">
      <h2>Firebase Slot Booking Test</h2>

      <div className="section">
        <h3 style={{ color: "black" }}>Book a Slot</h3>
        <input
          type="text"
          placeholder="Enter slot ID (e.g., 0_0)"
          value={slot}
          onChange={(e) => setSlot(e.target.value)}
        />
        {/* <input type="file" onChange={(e) => setImage(e.target.files[0])} /> */}
        <button onClick={() => bookSlot(slot, userId)}>Book Slot</button>
        <button
          onClick={() =>
            createUser(
              userId,
              "sumit_sharma",
              "sumit sharma",
              "this is my bio",
              "mywebsite.com",
              image
            )
          }
        >
          Create User
        </button>

        {message && <p style={{ color: "black" }}>{message}</p>}
      </div>

      <div className="section">
        <h3 style={{ color: "black" }}>Upload Image</h3>
        <input
          type="text"
          placeholder="Enter slot ID (e.g., 0_0)"
          value={slot}
          onChange={(e) => setSlot(e.target.value)}
        />
        <input type="file" onChange={(e) => setImage(e.target.files[0])} />
        <button onClick={() => uploadImage(slot, userId, image)}>
          Upload the image
        </button>
        {message && <p style={{ color: "black" }}>{message}</p>}
        <button onClick={() => resetSlot(slot)}>Reset Slot</button>
        <button onClick={() => likeImage(slot, userId)}>Like the image</button>
        <button onClick={() => unlikeImage(slot, userId)}>
          Unlike the image
        </button>
        <button onClick={() => incrementViewCount(slot)}>View count</button>
        <button onClick={() => incrementProfileViewCount(slot)}>
          Profile View count
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "10px",
        }}
      >
        {slots.length > 0 ? (
          slots.map((image) => (
            <div key={image.id} style={{ textAlign: "center" }}>
              <img
                src={image.imageURL}
                alt={"alt"}
                style={{ width: "100%", height: "auto", borderRadius: "10px" }}
              />
              <p>Slot: {image.slot_id}</p>
            </div>
          ))
        ) : (
          <p>No images found</p>
        )}
      </div>
    </div>
  );
}

export default App;
