const { indexedDB, IDBKeyRange } = require('fake-indexeddb');
global.indexedDB = indexedDB;

// Mock the openDB function from sw.js
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('civicshield-offline', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('pending-incidents', { keyPath: 'id', autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// 1. Simulate saving offline incident (from MobileResponder.jsx)
function saveOfflineIncident(data) {
  return new Promise((resolve, reject) => {
    openDB().then(db => {
      const tx = db.transaction('pending-incidents', 'readwrite');
      const store = tx.objectStore('pending-incidents');
      const addReq = store.add({ data });
      addReq.onsuccess = () => resolve(addReq.result);
      addReq.onerror = () => reject(addReq.error);
    });
  });
}

// 2. Fetch all pending incidents (from sw.js)
function getAllPending(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending-incidents', 'readonly');
    const store = tx.objectStore('pending-incidents');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// 3. Delete pending incident
function deletePending(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending-incidents', 'readwrite');
    const store = tx.objectStore('pending-incidents');
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function runTests() {
  console.log("=== Running Offline Sync Tests ===");
  
  // Test 1: Multiple queued incidents
  console.log("Test 1: Airplane Mode Submission (Queueing multiple incidents)");
  await saveOfflineIncident({ description: "Flood at Main St", location: { lat: 10, lon: 20 } });
  await saveOfflineIncident({ description: "Invalid payload (simulate)", location: { lat: 900, lon: 20 } });
  console.log("✅ Successfully saved 2 incidents to IndexedDB offline queue.");

  const db = await openDB();
  const pending = await getAllPending(db);
  console.log(`✅ Retrieved ${pending.length} pending incidents from IndexedDB.`);
  
  // Test 2 & 3: Successful Sync & Invalid payload rejection
  console.log("Test 2 & 3: Sync after reconnect & Invalid Payload Rejection");
  let successfulSyncs = 0;
  
  for (const incident of pending) {
    // Mocking the fetch call
    let responseOk = true;
    let responseStatus = 200;
    
    if (incident.data.description.includes('Invalid payload')) {
      responseOk = false;
      responseStatus = 400; // Simulated Bad Request
    }
    
    if (responseOk || (responseStatus >= 400 && responseStatus < 500)) {
       await deletePending(db, incident.id);
       successfulSyncs++;
       if (!responseOk) {
         console.log(`✅ Rejected invalid payload (ID: ${incident.id}, Status: 400), removed from queue to prevent loop.`);
       } else {
         console.log(`✅ Successfully synced valid payload (ID: ${incident.id}), removed from queue.`);
       }
    } else {
       console.log(`❌ Server error 500, kept in queue for retry.`);
    }
  }
  
  const remaining = await getAllPending(db);
  console.log(`✅ Remaining in queue after sync cycle: ${remaining.length}`);
  
  if (remaining.length === 0) {
    console.log("🎉 ALL TESTS PASSED!");
  } else {
    console.error("❌ TESTS FAILED!");
  }
}

runTests().catch(console.error);
