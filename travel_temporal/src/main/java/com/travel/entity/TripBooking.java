package com.travel.entity;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "trip_bookings")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TripBooking {

    @Id
    private String bookingId; // travel_<userId>
    private String userId;
    
    private String origin;
    private String destination;
    private String departureDate;
    private String returnDate;
    private int travelersCount;
    private boolean includeInsurance;
    
    private String status; // PENDING, FLIGHT_BOOKED, HOTEL_BOOKED, CONFIRMED, CANCELLED
    
    @Column(length = 2000)
    private String aiAdvisory;
    
    @OneToOne(cascade = CascadeType.ALL)
    @JoinColumn(name = "flight_booking_id")
    private FlightBooking flightBooking;
    
    @OneToOne(cascade = CascadeType.ALL)
    @JoinColumn(name = "hotel_booking_id")
    private HotelBooking hotelBooking;
    
    @OneToOne(cascade = CascadeType.ALL)
    @JoinColumn(name = "transport_booking_id")
    private TransportBooking transportBooking;
}
