package com.travel.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class TravelRequest {

    private String userId;
    private String destination;
    private String travelDate;
    private boolean simulateFlightFailure;
    private boolean simulateHotelFailure;
    private boolean simulateTransportFailure;
}
