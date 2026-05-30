package com.travel.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class TravelRequest {

    private String userId;
    private String origin;
    private String destination;
    private String travelDate;
    private String departureDate;
    private String returnDate;
    private String travelClass;
    private String hotelRating;
    private String transportVehicle;
    private int travelersCount;
    private boolean includeInsurance;
    private boolean simulateFlightFailure;
    private boolean simulateHotelFailure;
    private boolean simulateTransportFailure;
}
