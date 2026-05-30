package com.travel.activities;

import com.travel.dto.TravelRequest;
import com.travel.entity.FlightBooking;
import com.travel.entity.HotelBooking;
import com.travel.entity.TransportBooking;
import com.travel.entity.TripBooking;
import com.travel.repository.TripBookingRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
@Slf4j
public class TravelActivitiesImpl implements TravelActivities {

    @Autowired
    private TripBookingRepository tripBookingRepository;

    @Override
    public void bookFlight(TravelRequest travelRequest) {
        if (travelRequest.isSimulateFlightFailure()) {
            log.warn("⚠️ Simulating Flight Booking Failure for user: {}", travelRequest.getUserId());
            throw new RuntimeException("Flight booking API timeout or service unavailable!");
        }

        String bookingId = "travel_" + travelRequest.getUserId();
        String flightCode = "FLIGHT-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();

        // 1. Create and populate FlightBooking entity
        FlightBooking flightBooking = FlightBooking.builder()
                .flightBookingId(flightCode)
                .origin(travelRequest.getOrigin())
                .destination(travelRequest.getDestination())
                .departureDate(travelRequest.getDepartureDate())
                .travelClass(travelRequest.getTravelClass())
                .status("BOOKED")
                .build();

        // 2. Create parent TripBooking entity (overwriting any previous run data)
        TripBooking tripBooking = TripBooking.builder()
                .bookingId(bookingId)
                .userId(travelRequest.getUserId())
                .origin(travelRequest.getOrigin())
                .destination(travelRequest.getDestination())
                .departureDate(travelRequest.getDepartureDate())
                .returnDate(travelRequest.getReturnDate())
                .travelersCount(travelRequest.getTravelersCount())
                .includeInsurance(travelRequest.isIncludeInsurance())
                .status("FLIGHT_BOOKED")
                .flightBooking(flightBooking)
                .build();

        tripBookingRepository.save(tripBooking);

        log.info("✈️ Flight booked successfully in DB (Table: flight_bookings, Code: {}): From {} to {} on {} for {} traveler(s) in {} class.",
                flightCode,
                travelRequest.getOrigin(),
                travelRequest.getDestination(),
                travelRequest.getDepartureDate(),
                travelRequest.getTravelersCount(),
                travelRequest.getTravelClass());
    }

    @Override
    public void cancelFlight(TravelRequest travelRequest) {
        String bookingId = "travel_" + travelRequest.getUserId();
        tripBookingRepository.findById(bookingId).ifPresent(trip -> {
            if (trip.getFlightBooking() != null) {
                trip.getFlightBooking().setStatus("CANCELLED");
            }
            trip.setStatus("FLIGHT_CANCELLED");
            tripBookingRepository.save(trip);
        });

        log.info("🛑 DB Reverted (Table: flight_bookings): Flight reservation cancelled (From {} to {} on {} for user {})",
                travelRequest.getOrigin(),
                travelRequest.getDestination(),
                travelRequest.getDepartureDate(),
                travelRequest.getUserId());
    }

    @Override
    public void bookHotel(TravelRequest travelRequest) {
        if (travelRequest.isSimulateHotelFailure()) {
            log.warn("⚠️ Simulating Hotel Booking Failure for user: {}", travelRequest.getUserId());
            throw new RuntimeException("Hotel room inventory lock failed!");
        }

        String bookingId = "travel_" + travelRequest.getUserId();
        TripBooking trip = tripBookingRepository.findById(bookingId)
                .orElseThrow(() -> new RuntimeException("Trip booking record not found for: " + bookingId));

        String hotelCode = "HOTEL-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();

        // Create and populate HotelBooking entity
        HotelBooking hotelBooking = HotelBooking.builder()
                .hotelBookingId(hotelCode)
                .hotelRating(travelRequest.getHotelRating())
                .destination(travelRequest.getDestination())
                .checkInDate(travelRequest.getDepartureDate())
                .checkOutDate(travelRequest.getReturnDate())
                .status("BOOKED")
                .build();

        trip.setHotelBooking(hotelBooking);
        trip.setStatus("HOTEL_BOOKED");
        tripBookingRepository.save(trip);

        log.info("🏨 Hotel booked successfully in DB (Table: hotel_bookings, Code: {}): {} at {} (Check-in: {}, Check-out: {}, Guests: {}).",
                hotelCode,
                travelRequest.getHotelRating(),
                travelRequest.getDestination(),
                travelRequest.getDepartureDate(),
                travelRequest.getReturnDate(),
                travelRequest.getTravelersCount());
    }

    @Override
    public void cancelHotel(TravelRequest travelRequest) {
        String bookingId = "travel_" + travelRequest.getUserId();
        tripBookingRepository.findById(bookingId).ifPresent(trip -> {
            if (trip.getHotelBooking() != null) {
                trip.getHotelBooking().setStatus("CANCELLED");
            }
            trip.setStatus("HOTEL_CANCELLED");
            tripBookingRepository.save(trip);
        });

        log.info("🛑 DB Reverted (Table: hotel_bookings): Hotel reservation at {} (Rating: {}) cancelled for user {}",
                travelRequest.getDestination(),
                travelRequest.getHotelRating(),
                travelRequest.getUserId());
    }

    @Override
    public void arrangeTransport(TravelRequest travelRequest) {
        if (travelRequest.isSimulateTransportFailure()) {
            log.warn("⚠️ Simulating Local Transport Arranging Failure for user: {}", travelRequest.getUserId());
            throw new RuntimeException("No executive vehicles available at airport transfer dispatch!");
        }

        String bookingId = "travel_" + travelRequest.getUserId();
        TripBooking trip = tripBookingRepository.findById(bookingId)
                .orElseThrow(() -> new RuntimeException("Trip booking record not found for: " + bookingId));

        String transCode = "TRANS-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();

        // Create and populate TransportBooking entity
        TransportBooking transportBooking = TransportBooking.builder()
                .transportBookingId(transCode)
                .transportVehicle(travelRequest.getTransportVehicle())
                .destination(travelRequest.getDestination())
                .status("BOOKED")
                .build();

        trip.setTransportBooking(transportBooking);
        trip.setStatus("TRANSPORT_ARRANGED");
        tripBookingRepository.save(trip);

        log.info("🚗 Executive transfer arranged successfully in DB (Table: transport_bookings, Code: {}): Chauffeur driven {} for {} traveler(s) at destination {}.",
                transCode,
                travelRequest.getTransportVehicle(),
                travelRequest.getTravelersCount(),
                travelRequest.getDestination());
    }

    @Override
    public void cancelTransport(TravelRequest travelRequest) {
        String bookingId = "travel_" + travelRequest.getUserId();
        tripBookingRepository.findById(bookingId).ifPresent(trip -> {
            if (trip.getTransportBooking() != null) {
                trip.getTransportBooking().setStatus("CANCELLED");
            }
            trip.setStatus("TRANSPORT_CANCELLED");
            tripBookingRepository.save(trip);
        });

        log.info("🛑 DB Reverted (Table: transport_bookings): Executive transfer ({}) at destination {} cancelled for user {}",
                travelRequest.getTransportVehicle(),
                travelRequest.getDestination(),
                travelRequest.getUserId());
    }

    @Override
    public void cancelBooking(TravelRequest travelRequest) {
        String bookingId = "travel_" + travelRequest.getUserId();
        tripBookingRepository.findById(bookingId).ifPresent(trip -> {
            trip.setStatus("CANCELLED");
            tripBookingRepository.save(trip);
        });

        log.info("🛑 DB Final Rollback State Committed: SAGA transaction cancelled and resources fully compensated for user: {}.",
                travelRequest.getUserId());
    }

    @Override
    public void confirmBooking(TravelRequest travelRequest) {
        String bookingId = "travel_" + travelRequest.getUserId();
        TripBooking trip = tripBookingRepository.findById(bookingId)
                .orElseThrow(() -> new RuntimeException("Trip booking record not found for: " + bookingId));

        trip.setStatus("CONFIRMED");
        tripBookingRepository.save(trip);

        log.info("✅ Travel Booking finalized & ledger committed in DB (Table: trip_bookings): From {} to {} for {} travelers (Class: {}, Chauffeur: {}, Insurance: {}). Enjoy your trip, {}!",
                travelRequest.getOrigin(),
                travelRequest.getDestination(),
                travelRequest.getTravelersCount(),
                travelRequest.getTravelClass(),
                travelRequest.getTransportVehicle(),
                travelRequest.isIncludeInsurance() ? "Yes" : "No",
                travelRequest.getUserId());
    }
}
