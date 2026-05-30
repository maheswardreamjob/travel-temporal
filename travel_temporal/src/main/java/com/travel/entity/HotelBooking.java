package com.travel.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "hotel_bookings")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class HotelBooking {

    @Id
    private String hotelBookingId; // generated HOTEL-XXXX
    
    private String hotelRating;
    private String destination;
    private String checkInDate;
    private String checkOutDate;
    private String status; // BOOKED, CANCELLED
}
