package com.travel.activities;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.travel.dto.TravelRequest;
import com.travel.repository.TripBookingRepository;
import com.travel.config.PromptConfig;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@Slf4j
public class AiAdvisoryActivitiesImpl implements AiAdvisoryActivities {

    @Autowired
    private PromptConfig promptConfig;

    @Value("${gemini.api.key:}")
    private String apiKey;

    @Value("${gemini.api.url}")
    private String apiUrl;

    private final RestClient restClient = RestClient.builder().build();
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Autowired
    private TripBookingRepository tripBookingRepository;

    @Override
    public void saveAiAdvisory(String bookingId, String advisory) {
        log.info("📝 [ACTIVITY] Saving AI Travel Advisory for booking: {}", bookingId);
        tripBookingRepository.findById(bookingId).ifPresent(trip -> {
            trip.setAiAdvisory(advisory);
            tripBookingRepository.save(trip);
            log.info("✅ AI Travel Advisory successfully saved for booking: {}", bookingId);
        });
    }

    @Override
    public String generateAiAdvisory(TravelRequest travelRequest) {
        log.info("🤖 [ACTIVITY] Invoking AI Risk & Policy Advisor for destination: {}", travelRequest.getDestination());
        
        // If no API Key is available, run local mock advisor fallback (great for offline / out-of-box setup)
        if (apiKey == null || apiKey.trim().isEmpty()) {
            log.warn("⚠️ No Gemini API Key provided for AI Advisor. Running local mock advisor fallback.");
            return mockAdvisor(travelRequest);
        }

        try {
            log.info("🤖 [ACTIVITY] Calling Gemini API to evaluate travel risks for destination: {}", travelRequest.getDestination());
            
            // Use the trip type explicitly configured by the user in the UI
            final String finalTripType = (travelRequest.getTripType() != null && !travelRequest.getTripType().isBlank())
                ? travelRequest.getTripType() : "Solo Trip";

            // Run Weather and Visa Agents in parallel
            log.info("*** WEATHER AGENT *** Assessing weather risks and conditions for destination: {}", travelRequest.getDestination());
            java.util.concurrent.CompletableFuture<String> weatherFuture = java.util.concurrent.CompletableFuture.supplyAsync(() -> {
                try {
                    return callAgent(
                        promptConfig.getWeatherPrompt()
                            .replace("{destination}", travelRequest.getDestination())
                            .replace("{departureDate}", travelRequest.getDepartureDate()),
                        apiKey
                    );
                } catch (Exception e) {
                    throw new RuntimeException(e);
                }
            });

            log.info("*** VISA AGENT *** Checking entry and visa requirements from {} to {}", travelRequest.getOrigin(), travelRequest.getDestination());
            java.util.concurrent.CompletableFuture<String> visaFuture = java.util.concurrent.CompletableFuture.supplyAsync(() -> {
                try {
                    return callAgent(
                        promptConfig.getVisaPrompt()
                            .replace("{origin}", travelRequest.getOrigin())
                            .replace("{destination}", travelRequest.getDestination()),
                        apiKey
                    );
                } catch (Exception e) {
                    throw new RuntimeException(e);
                }
            });

            // Wait for both parallel agent tasks to finish
            String weatherReport = weatherFuture.get();
            log.info("🌤️ [Weather Agent Report]: {}", weatherReport);

            String visaReport = visaFuture.get();
            log.info("🛂 [Visa Agent Report]: {}", visaReport);

            // Step 3: Call Coordinator Agent to synthesize (runs sequentially using outputs of first two)
            log.info("*** COORDINATOR AGENT *** Synthesizing agent reports...");
            String finalSynthesis = callAgent(
                promptConfig.getCoordinatorPrompt()
                    .replace("{tripType}", finalTripType)
                    .replace("{travelersCount}", String.valueOf(travelRequest.getTravelersCount()))
                    .replace("{weatherReport}", weatherReport)
                    .replace("{visaReport}", visaReport),
                apiKey
            );
            
            return "✨ Aura AI Advisor:\n" + finalSynthesis;

        } catch (Exception e) {
            log.error("❌ Error calling Gemini API in AI Advisor. Falling back to local mock advisor.", e);
            return mockAdvisor(travelRequest);
        }
    }

    private String callAgent(String systemInstruction, String apiKey) throws Exception {
        String urlWithKey = apiUrl + "?key=" + apiKey;

        Map<String, Object> requestBody = new HashMap<>();
        Map<String, Object> textPart = Map.of("text", systemInstruction);
        Map<String, Object> content = Map.of("parts", List.of(textPart));
        requestBody.put("contents", List.of(content));

        Map<String, Object> generationConfig = Map.of("responseMimeType", "text/plain");
        requestBody.put("generationConfig", generationConfig);

        String rawResponse = restClient.post()
                .uri(urlWithKey)
                .contentType(MediaType.APPLICATION_JSON)
                .body(requestBody)
                .retrieve()
                .body(String.class);

        JsonNode responseNode = objectMapper.readTree(rawResponse);
        return responseNode
                .path("candidates")
                .get(0)
                .path("content")
                .path("parts")
                .get(0)
                .path("text")
                .asText()
                .trim();
    }

    private String mockAdvisor(TravelRequest travelRequest) {
        log.info("*** COORDINATOR AGENT (MOCK fallback) *** Generating offline advisor guidelines for destination: {}", travelRequest.getDestination());
        String dest = travelRequest.getDestination().toLowerCase();
        
        // Use the explicitly chosen trip type from the UI
        String tripType = (travelRequest.getTripType() != null && !travelRequest.getTripType().isBlank())
            ? travelRequest.getTripType() : "Solo Trip";
        boolean isFamily   = tripType.toLowerCase().contains("family") || tripType.toLowerCase().contains("group");
        boolean isCouple   = tripType.toLowerCase().contains("couple") || tripType.toLowerCase().contains("honeymoon");
        boolean isBusiness = tripType.toLowerCase().contains("business");
        
        StringBuilder mockAdvisory = new StringBuilder();
        
        if (dest.contains("tokyo") || dest.contains("japan")) {
            mockAdvisory.append("🌤️ Weather: Tokyo rating is 4/5 ★. Pleasant warm breeze is expected.\n");
            mockAdvisory.append("🛂 Visa Status: Not Required for short tourism visits (up to 90 days) with a valid passport.\n");
            if (isFamily) {
                mockAdvisory.append("💡 Expert Recommendation: Perfect for a ").append(tripType).append("! December is the best time for winter getaways in Japan, while April cherry blossom season is ideal for children sightseeing.");
            } else if (isCouple) {
                mockAdvisory.append("💡 Expert Recommendation: Ideal ").append(tripType).append("! Autumn months of October/November offer romantic, temperate foliage scenery across gardens.");
            } else if (isBusiness) {
                mockAdvisory.append("💡 Expert Recommendation: Tokyo is excellent for a ").append(tripType).append(". The Marunouchi and Shinjuku districts host world-class conference venues with efficient rail connectivity.");
            } else {
                mockAdvisory.append("💡 Expert Recommendation: Great ").append(tripType).append("! August features vibrant traditional summer festivals and local fireworks events.");
            }
        } else if (dest.contains("bali") || dest.contains("indonesia")) {
            mockAdvisory.append("🌴 Weather: Bali rating is 3/5 ★. Occasional brief tropical rain showers.\n");
            mockAdvisory.append("🛂 Visa Status: Visa on Arrival required (30 days stay limit, fee applies).\n");
            if (isFamily) {
                mockAdvisory.append("💡 Expert Recommendation: Bali ").append(tripType).append(". August is prime dry-season weather and optimal for booking nature resorts with waterfalls and water parks.");
            } else if (isCouple) {
                mockAdvisory.append("💡 Expert Recommendation: Romantic ").append(tripType).append(" to Bali! Private villas in Ubud and Seminyak offer stunning sunset views ideal for couples.");
            } else {
                mockAdvisory.append("💡 Expert Recommendation: August is the dry season, making it perfect for outdoor snorkeling and volcanic hiking adventures.");
            }
        } else if (dest.contains("london") || dest.contains("united kingdom") || dest.contains("uk")) {
            mockAdvisory.append("☔ Weather: London rating is 3/5 ★. Cool temperatures with light scattered showers.\n");
            mockAdvisory.append("🛂 Visa Status: Not Required for short visits with at least 6 months passport validity.\n");
            if (isFamily) {
                mockAdvisory.append("💡 Expert Recommendation: London ").append(tripType).append(". December is magical for winter wonderland markets and festive lights, whereas August offers mild garden weather.");
            } else if (isBusiness) {
                mockAdvisory.append("💡 Expert Recommendation: London is a premier destination for a ").append(tripType).append(". The Canary Wharf and City of London are ideal for meetings.");
            } else {
                mockAdvisory.append("💡 Expert Recommendation: Perfect city tour. August offers pleasant weather for walking tours along the Thames without extreme summer heat.");
            }
        } else if (dest.contains("sydney") || dest.contains("australia")) {
            mockAdvisory.append("☀️ Weather: Sydney rating is 5/5 ★. Beautiful sunny, mild days.\n");
            mockAdvisory.append("🛂 Visa Status: Electronic Travel Authority (ETA) required before departure.\n");
            mockAdvisory.append("💡 Expert Recommendation: Highly recommended for a ").append(tripType).append(". Plan visits around December to experience their stunning summer harbor fireworks.");
        } else if (dest.contains("mumbai") || dest.contains("india")) {
            mockAdvisory.append("🌧️ Weather: Mumbai rating is 2/5 ★. Heavy monsoon rainfall and high humidity.\n");
            mockAdvisory.append("🛂 Visa Status: E-Visa required for international tourists before travel.\n");
            mockAdvisory.append("💡 Expert Recommendation: ").append(tripType).append(" alert: Monsoon peaks around July/August, meaning indoor activities are preferred. December to February is the optimal season for pleasant city sightseeing.");
        } else if (dest.contains("new york") || dest.contains("usa")) {
            mockAdvisory.append("🗽 Weather: New York rating is 4/5 ★. Warm and sunny city weather.\n");
            mockAdvisory.append("🛂 Visa Status: ESTA visa waiver required at least 72 hours prior to flight departure.\n");
            if (isFamily) {
                mockAdvisory.append("💡 Expert Recommendation: Great ").append(tripType).append("! Visiting water fountains or Central Park attractions is best in August. Alternatively, December offers festive skating rink setups.");
            } else if (isBusiness) {
                mockAdvisory.append("💡 Expert Recommendation: New York is ideal for a ").append(tripType).append(". Midtown Manhattan hosts world-class conference centers and corporate venues.");
            } else {
                mockAdvisory.append("💡 Expert Recommendation: August is prime festival season. Consider booking rooftop lounges or broadway outings during the mild autumn weeks.");
            }
        } else if (dest.contains("paris") || dest.contains("france")) {
            mockAdvisory.append("🗼 Weather: Paris rating is 4/5 ★. Mild, temperate romantic climate.\n");
            mockAdvisory.append("🛂 Visa Status: Schengen visa rules apply. Valid passport required.\n");
            mockAdvisory.append("💡 Expert Recommendation: Tailored for a ").append(tripType).append(". August is the popular vacation season, but late spring (May) or early autumn (September) offers shorter lines and better sightseeing temperature.");
        } else {
            mockAdvisory.append("✈️ Weather: rating is 4/5 ★. Comfortable conditions predicted.\n");
            mockAdvisory.append("🛂 Visa Status: Entry policies valid. Ensure passport has 6+ months validity.\n");
            mockAdvisory.append("💡 Expert Recommendation: Plan nature and waterfall trips for August, while snow/winter activities are best scheduled for December.");
        }
        
        return "✨ Aura AI Advisor:\n" + mockAdvisory.toString();
    }
}
