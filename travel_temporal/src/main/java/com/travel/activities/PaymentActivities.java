package com.travel.activities;

import com.travel.dto.TravelRequest;
import io.temporal.activity.ActivityInterface;
import io.temporal.activity.ActivityMethod;

@ActivityInterface
public interface PaymentActivities {

    @ActivityMethod
    void chargeCreditCard(TravelRequest travelRequest, double amount, String paymentId);

    @ActivityMethod
    void issueInvoice(TravelRequest travelRequest, double amount, String paymentId);

    @ActivityMethod
    void awardLoyaltyPoints(TravelRequest travelRequest, int points, String loyaltyId);

    @ActivityMethod
    void refundCreditCard(TravelRequest travelRequest, double amount, String paymentId);
}
