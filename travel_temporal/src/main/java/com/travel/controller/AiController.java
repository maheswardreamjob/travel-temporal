package com.travel.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.travel.dto.TravelRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;
import com.travel.config.PromptConfig;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.client.advisor.MessageChatMemoryAdvisor;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.chat.memory.InMemoryChatMemoryRepository;
import org.springframework.ai.chat.memory.MessageWindowChatMemory;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@RestController
@RequestMapping("/travel/ai")
@CrossOrigin(origins = "*")
@Slf4j
public class AiController {

    @Autowired
    private PromptConfig promptConfig;

    @Value("${gemini.api.key:}")
    private String defaultApiKey;

    @Value("${gemini.api.url}")
    private String apiUrl;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final RestClient restClient = RestClient.builder().build();

    private ChatClient chatClient;
    private final ChatMemory chatMemory = org.springframework.ai.chat.memory.MessageWindowChatMemory.builder()
            .chatMemoryRepository(new org.springframework.ai.chat.memory.InMemoryChatMemoryRepository())
            .maxMessages(100)
            .build();

    @Autowired
    public void setChatClientBuilder(ChatClient.Builder chatClientBuilder) {
        this.chatClient = chatClientBuilder
                .defaultSystem("You are a helpful travel assistant. You can book trips and check statuses. If you are missing required information to book a trip (like origin, destination, or dates), ask the user for them.")
                .defaultAdvisors(org.springframework.ai.chat.client.advisor.MessageChatMemoryAdvisor.builder(this.chatMemory).build())
                .build();
    }

    @PostMapping("/chat")
    public ResponseEntity<Map<String, String>> chatWithAgent(@RequestBody Map<String, String> request) {
        String prompt = request.get("prompt");
        String userId = request.getOrDefault("userId", "default_user");

        log.info("🤖 Conversational Agent received prompt: {}", prompt);

        // Uses ChatClient to interact with LLM, remembering history via userId
        String responseText = this.chatClient.prompt()
                .user(prompt)
                .advisors(a -> a.param("chat_memory_conversation_id", userId))
                .tools("bookTrip", "getTripStatus")
                .call()
                .content();

        Map<String, String> response = new HashMap<>();
        response.put("response", responseText);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/parse")
    public ResponseEntity<TravelRequest> parseBooking(
            @RequestBody Map<String, String> requestPayload,
            @RequestHeader(value = "X-Gemini-Key", required = false) String headerKey) {

        String prompt = requestPayload.get("prompt");
        String userId = requestPayload.getOrDefault("userId", "ai_passenger");

        log.info("🤖 Received AI parse request for prompt: '{}'", prompt);

        // Decide which API key to use (header key overrides properties config)
        String apiKey = headerKey;
        if (apiKey == null || apiKey.trim().isEmpty()) {
            apiKey = defaultApiKey;
        }

        TravelRequest parsedRequest;

        // If no API Key is available, run local mock parsing fallback (great for
        // offline / out-of-box setup)
        if (apiKey == null || apiKey.trim().isEmpty()) {
            log.warn("⚠️ No Gemini API Key provided. Routing to local MOCK PARSER fallback.");
            parsedRequest = mockParse(prompt, userId);
        } else {
            try {
                log.info("🤖 [API PATH] Invoking GEMINI API endpoint with configured API Key...");
                log.info("--GEMINI  app invoked....");
                parsedRequest = callGeminiApi(prompt, apiKey, userId);
            } catch (Exception e) {
                log.error("❌ Error calling Gemini API [Details: {}]. Falling back to local MOCK PARSER.", e.getMessage(), e);
                parsedRequest = mockParse(prompt, userId);
            }
        }

        return ResponseEntity.ok(parsedRequest);
    }

    private TravelRequest callGeminiApi(String prompt, String apiKey, String userId) throws Exception {
        String urlWithKey = apiUrl + "?key=" + apiKey;

        String systemInstruction = promptConfig.getParsePrompt().replace("{userId}", userId);

        Map<String, Object> requestBody = new HashMap<>();
        Map<String, Object> textPart = Map.of("text", systemInstruction + "\nUser Prompt:\n" + prompt);
        Map<String, Object> content = Map.of("parts", List.of(textPart));
        requestBody.put("contents", List.of(content));

        // Use responseMimeType: "application/json" to force Gemini to reply with
        // structured JSON
        Map<String, Object> generationConfig = Map.of("responseMimeType", "application/json");
        requestBody.put("generationConfig", generationConfig);

        log.info("Sending request to Gemini API: {}", apiUrl);
        String rawResponse = restClient.post()
                .uri(urlWithKey)
                .contentType(MediaType.APPLICATION_JSON)
                .body(requestBody)
                .retrieve()
                .body(String.class);

        // Extract JSON text from Gemini response structure
        JsonNode responseNode = objectMapper.readTree(rawResponse);
        String extractedJsonText = responseNode
                .path("candidates")
                .get(0)
                .path("content")
                .path("parts")
                .get(0)
                .path("text")
                .asText();

        log.info("Raw JSON extracted from Gemini: {}", extractedJsonText);

        TravelRequest travelRequest = objectMapper.readValue(extractedJsonText, TravelRequest.class);

        // Ensure some safety fallbacks
        if (travelRequest.getUserId() == null)
            travelRequest.setUserId(userId);
        if (travelRequest.getTravelersCount() <= 0)
            travelRequest.setTravelersCount(1);
        if (travelRequest.getDepartureDate() == null)
            travelRequest.setDepartureDate("2026-06-15");
        if (travelRequest.getReturnDate() == null)
            travelRequest.setReturnDate("2026-06-22");

        return travelRequest;
    }

    /**
     * Local regex/keyword parser fallback.
     * Extracts values from standard demo presets or typical keywords so it works
     * offline/without API keys.
     */
    private TravelRequest mockParse(String prompt, String userId) {
        log.info("📋 Running local mock regex-parser for prompt: {}", prompt);
        String normalized = prompt.toLowerCase();

        // Defaults
        String origin = "Paris, France";
        String destination = "Tokyo, Japan";
        String departureDate = "2026-06-15";
        String returnDate = "2026-06-22";
        String travelClass = "Business Class";
        String hotelRating = "5-Star Luxury Resort";
        String transportVehicle = "Tesla Model Y (EV)";
        int travelersCount = 2;
        boolean includeInsurance = true;

        // Origin parsing
        if (normalized.contains("new york") || normalized.contains("jfk") || normalized.contains("usa")) {
            origin = "New York, USA";
        } else if (normalized.contains("london") || normalized.contains("uk") || normalized.contains("lhr")) {
            origin = "London, United Kingdom";
        } else if (normalized.contains("mumbai") || normalized.contains("bom") || normalized.contains("india")) {
            origin = "Mumbai, India";
        } else if (normalized.contains("bali") || normalized.contains("dps") || normalized.contains("indonesia")) {
            origin = "Bali, Indonesia";
        } else if (normalized.contains("sydney") || normalized.contains("syd") || normalized.contains("australia")) {
            origin = "Sydney, Australia";
        } else if (normalized.contains("tokyo") || normalized.contains("hnd") || normalized.contains("japan")) {
            origin = "Tokyo, Japan";
        }

        // Destination parsing
        if (normalized.contains("to new york") || normalized.contains("destination new york")) {
            destination = "New York, USA";
        } else if (normalized.contains("to london") || normalized.contains("destination london")) {
            destination = "London, United Kingdom";
        } else if (normalized.contains("to mumbai") || normalized.contains("destination mumbai")) {
            destination = "Mumbai, India";
        } else if (normalized.contains("to bali") || normalized.contains("destination bali")) {
            destination = "Bali, Indonesia";
        } else if (normalized.contains("to sydney") || normalized.contains("destination sydney")) {
            destination = "Sydney, Australia";
        } else if (normalized.contains("to paris") || normalized.contains("destination paris")) {
            destination = "Paris, France";
        } else if (normalized.contains("to tokyo") || normalized.contains("destination tokyo")
                || normalized.contains("tokyo")) {
            // Keep default tokyo, but handle others
            if (!origin.equals("Tokyo, Japan")) {
                destination = "Tokyo, Japan";
            } else {
                destination = "Paris, France"; // swap
            }
        }

        // Flight class parsing
        if (normalized.contains("first")) {
            travelClass = "First Class";
        } else if (normalized.contains("economy") && !normalized.contains("premium")) {
            travelClass = "Economy Class";
        } else if (normalized.contains("premium economy")) {
            travelClass = "Premium Economy";
        } else if (normalized.contains("business")) {
            travelClass = "Business Class";
        }

        // Hotel rating parsing
        if (normalized.contains("luxury") || normalized.contains("5-star") || normalized.contains("5 star")) {
            hotelRating = "5-Star Luxury Resort";
        } else if (normalized.contains("4-star") || normalized.contains("4 star")
                || normalized.contains("premium hotel")) {
            hotelRating = "4-Star Premium Hotel";
        } else if (normalized.contains("penthouse") || normalized.contains("boutique")) {
            hotelRating = "Boutique Penthouse Suite";
        }

        // Transport parsing
        if (normalized.contains("tesla") || normalized.contains("ev") || normalized.contains("electric")) {
            transportVehicle = "Tesla Model Y (EV)";
        } else if (normalized.contains("mercedes") || normalized.contains("s-class")
                || normalized.contains("executive")) {
            transportVehicle = "Mercedes S-Class (Executive)";
        } else if (normalized.contains("escalade") || normalized.contains("suv") || normalized.contains("cadillac")) {
            transportVehicle = "Cadillac Escalade (Luxury SUV)";
        }

        // Travelers count parsing
        Pattern travelersPattern = Pattern.compile("(\\d+)\\s*(traveler|passenger|guest|people)");
        Matcher travelersMatcher = travelersPattern.matcher(normalized);
        if (travelersMatcher.find()) {
            try {
                travelersCount = Integer.parseInt(travelersMatcher.group(1));
            } catch (NumberFormatException ignored) {
            }
        } else if (normalized.contains("solo") || normalized.contains("me alone")) {
            travelersCount = 1;
        } else if (normalized.contains("couple") || normalized.contains("my partner")
                || normalized.contains("my wife")) {
            travelersCount = 2;
        }

        // Insurance parsing
        if (normalized.contains("no insurance") || normalized.contains("without insurance")
                || normalized.contains("exclude insurance")) {
            includeInsurance = false;
        }

        // Simple Date extraction (YYYY-MM-DD)
        Pattern datePattern = Pattern.compile("(\\d{4}-\\d{2}-\\d{2})");
        Matcher dateMatcher = datePattern.matcher(prompt);
        if (dateMatcher.find()) {
            departureDate = dateMatcher.group(1);
            if (dateMatcher.find()) {
                returnDate = dateMatcher.group(1);
            } else {
                // Return date default to 7 days later
                try {
                    java.time.LocalDate dep = java.time.LocalDate.parse(departureDate);
                    returnDate = dep.plusDays(7).toString();
                } catch (Exception ignored) {
                }
            }
        }

        return new TravelRequest(
                userId,
                origin,
                destination,
                departureDate, // travelDate
                departureDate,
                returnDate,
                travelClass,
                hotelRating,
                transportVehicle,
                travelersCount,
                null, // tripType - not parsed from NL yet; UI controls this field
                includeInsurance,
                false, false, false, false, false // chaos simulations false by default
        );
    }
}
