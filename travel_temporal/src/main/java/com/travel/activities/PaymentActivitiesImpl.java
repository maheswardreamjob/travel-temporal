package com.travel.activities;

import com.travel.dto.TravelRequest;
import com.travel.entity.LoyaltyRecord;
import com.travel.entity.PaymentRecord;
import com.travel.repository.LoyaltyRecordRepository;
import com.travel.repository.PaymentRecordRepository;
import com.travel.repository.TripBookingRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Service
@Slf4j
public class PaymentActivitiesImpl implements PaymentActivities {

    @Autowired
    private PaymentRecordRepository paymentRecordRepository;

    @Autowired
    private LoyaltyRecordRepository loyaltyRecordRepository;

    @Autowired
    private TripBookingRepository tripBookingRepository;

    @Override
    public void chargeCreditCard(TravelRequest travelRequest, double amount, String paymentId) {
        log.info("💳 [BILLING_ACTIVITY] Initiating credit card charge: Amount ${} for user: {}", amount, travelRequest.getUserId());
        
        if (travelRequest.isSimulatePaymentFailure()) {
            log.warn("⚠️ [BILLING_ACTIVITY] Simulating Credit Card Charge Failure!");
            throw new RuntimeException("Credit card declined or payment gateway timeout!");
        }

        PaymentRecord record = PaymentRecord.builder()
                .paymentId(paymentId)
                .bookingId("travel_" + travelRequest.getUserId())
                .amount(amount)
                .status("CHARGED")
                .transactionDate(LocalDateTime.now().toString())
                .build();

        paymentRecordRepository.save(record);
        
        // Update TripBooking status to BILLING_CHARGED
        String bookingId = "travel_" + travelRequest.getUserId();
        tripBookingRepository.findById(bookingId).ifPresent(trip -> {
            trip.setStatus("BILLING_CHARGED");
            tripBookingRepository.save(trip);
        });

        log.info("🎉 [BILLING_ACTIVITY] Credit card successfully charged. Record saved: {}", paymentId);
    }

    @Override
    public void issueInvoice(TravelRequest travelRequest, double amount, String paymentId) {
        log.info("🧾 [BILLING_ACTIVITY] Generating invoice for booking ID: {}", "travel_" + travelRequest.getUserId());
        
        // Just logs it and updates the status of the Trip
        String bookingId = "travel_" + travelRequest.getUserId();
        tripBookingRepository.findById(bookingId).ifPresent(trip -> {
            trip.setStatus("BILLING_INVOICED");
            tripBookingRepository.save(trip);
        });

        log.info("🎉 [BILLING_ACTIVITY] Invoice successfully generated for charge: {}", paymentId);
    }

    @Override
    public void awardLoyaltyPoints(TravelRequest travelRequest, int points, String loyaltyId) {
        log.info("🎁 [BILLING_ACTIVITY] Allocating travel loyalty points: {} for user: {}", points, travelRequest.getUserId());

        if (travelRequest.isSimulateLoyaltyFailure()) {
            log.warn("⚠️ [BILLING_ACTIVITY] Simulating Loyalty Points Award Failure!");
            throw new RuntimeException("Loyalty program database unavailable!");
        }

        LoyaltyRecord record = LoyaltyRecord.builder()
                .loyaltyId(loyaltyId)
                .userId(travelRequest.getUserId())
                .bookingId("travel_" + travelRequest.getUserId())
                .points(points)
                .status("AWARDED")
                .build();

        loyaltyRecordRepository.save(record);

        // Update TripBooking status to BILLING_COMPLETED
        String bookingId = "travel_" + travelRequest.getUserId();
        tripBookingRepository.findById(bookingId).ifPresent(trip -> {
            trip.setStatus("BILLING_COMPLETED");
            tripBookingRepository.save(trip);
        });

        log.info("🎉 [BILLING_ACTIVITY] Loyalty points successfully credited. Account ID: {}", loyaltyId);
    }

    @Override
    public void refundCreditCard(TravelRequest travelRequest, double amount, String paymentId) {
        log.warn("🔄 [BILLING_ACTIVITY] Initiating transaction reversal / refunding card: ${} (Charge ID: {})", amount, paymentId);

        paymentRecordRepository.findById(paymentId).ifPresent(record -> {
            record.setStatus("REFUNDED");
            paymentRecordRepository.save(record);
        });

        loyaltyRecordRepository.findByBookingId("travel_" + travelRequest.getUserId()).forEach(record -> {
            record.setStatus("REVERTED");
            loyaltyRecordRepository.save(record);
        });

        log.info("✅ [BILLING_ACTIVITY] Refund successfully processed. Transaction reverted: {}", paymentId);
    }
}
