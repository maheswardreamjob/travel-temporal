package com.travel.activities;

import com.travel.dto.TravelRequest;
import io.temporal.activity.ActivityInterface;

@ActivityInterface
public interface AiAdvisoryActivities {

    String generateAiAdvisory(TravelRequest travelRequest);

    void saveAiAdvisory(String bookingId, String advisory);
}
