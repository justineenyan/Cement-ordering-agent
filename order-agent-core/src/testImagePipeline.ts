import { validateAndTranscribeImage } from "./services/imageTranscriptionService.js";

async function testImages() {
  console.log("=================================================================");
  console.log("🧪 TESTING IMAGE VALIDATION & TRANSCRIPTION PIPELINE");
  console.log("=================================================================\n");

  // Test 1: HMIcon.png (Company Icon / Logo - MUST FAIL validation & MUST NOT transcribe)
  console.log("Test 1: HMIcon.png (Expected: Non-receipt / Logo -> REJECT, NO transcription)");
  try {
    const result1 = await validateAndTranscribeImage("test-images/HMIcon.png", 1001);
    console.log("Passed Validation:", result1.passedValidation);
    console.log("Status:", result1.verificationStatus);
    console.log("Rejection Reason:", result1.rejectionReason);
    console.log("Transcription:", result1.transcription ?? "None (Correctly aborted!)");
    console.log(result1.passedValidation === false ? "✅ TEST 1 PASSED: Logo correctly rejected without transcription." : "❌ TEST 1 FAILED: Logo was not rejected.");
  } catch (err: any) {
    console.error("Test 1 Error:", err.message);
  }

  console.log("\n-----------------------------------------------------------------\n");

  // Test 2: photo_2026-04-18_14-23-46.jpg (Payment Receipt - MUST PASS & TRANSCRIBE)
  console.log("Test 2: photo_2026-04-18_14-23-46.jpg (Expected: Genuine PoP -> VERIFY & TRANSCRIBE)");
  try {
    const result2 = await validateAndTranscribeImage("test-images/photo_2026-04-18_14-23-46.jpg", 1002);
    console.log("Passed Validation:", result2.passedValidation);
    console.log("Status:", result2.verificationStatus);
    console.log("Summary:", result2.summary);
    if (result2.transcription) {
      console.log("Extracted Details:", JSON.stringify(result2.transcription, null, 2));
    }
    console.log(result2.passedValidation === true ? "✅ TEST 2 PASSED: Receipt verified and transcribed." : "❌ TEST 2 FAILED");
  } catch (err: any) {
    console.error("Test 2 Error:", err.message);
  }

  console.log("\n=================================================================");
}

testImages();
