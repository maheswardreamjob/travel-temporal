package com.travel.repository;

import com.travel.entity.FlightBooking;
import com.travel.entity.HotelBooking;
import com.travel.entity.TransportBooking;
import com.travel.entity.TripBooking;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public interface TripBookingRepository extends JpaRepository<TripBooking, String> {

    @Modifying
    @Transactional
    @Query("UPDATE TripBooking t SET t.flightBooking = :flight, t.status = 'FLIGHT_BOOKED' WHERE t.bookingId = :id")
    void updateFlightBooking(@Param("id") String id, @Param("flight") FlightBooking flight);

    @Modifying
    @Transactional
    @Query("UPDATE TripBooking t SET t.hotelBooking = :hotel, t.status = 'HOTEL_BOOKED' WHERE t.bookingId = :id")
    void updateHotelBooking(@Param("id") String id, @Param("hotel") HotelBooking hotel);

    @Modifying
    @Transactional
    @Query("UPDATE TripBooking t SET t.transportBooking = :transport, t.status = 'TRANSPORT_ARRANGED' WHERE t.bookingId = :id")
    void updateTransportBooking(@Param("id") String id, @Param("transport") TransportBooking transport);
}

