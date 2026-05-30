package com.travel.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "flight_bookings")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FlightBooking {

    @Id
    private String flightBookingId; // generated FLIGHT-XXXX
    
    private String origin;
    private String destination;
    private String departureDate;
    private String travelClass;
    private String status; // BOOKED, CANCELLED
}
