package com.travel.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "transport_bookings")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TransportBooking {

    @Id
    private String transportBookingId; // generated TRANS-XXXX
    
    private String transportVehicle;
    private String destination;
    private String status; // BOOKED, CANCELLED
}
