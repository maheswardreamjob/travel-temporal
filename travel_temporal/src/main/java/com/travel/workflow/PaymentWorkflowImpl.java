package com.travel.workflow;

import com.travel.activities.PaymentActivities;
import com.travel.dto.TravelRequest;
import io.temporal.activity.ActivityOptions;
import io.temporal.common.RetryOptions;
import io.temporal.workflow.Saga;
import io.temporal.workflow.Workflow;

import java.time.Duration;

public class PaymentWorkflowImpl implements PaymentWorkflow {

    private final PaymentActivities activities = Workflow.newActivityStub(
            PaymentActivities.class,
            ActivityOptions.newBuilder()
                    .setStartToCloseTimeout(Duration.ofSeconds(10))
                    .setRetryOptions(RetryOptions.newBuilder()
                            .setMaximumAttempts(2) // limit retries for demo simulation speed
                            .build())
                    .build()
    );

    @Override
    public void processPayment(TravelRequest travelRequest, double amount) {
        String paymentId = "PAY-" + Workflow.randomUUID().toString().substring(0, 8).toUpperCase();
        String loyaltyId = "LOY-" + Workflow.randomUUID().toString().substring(0, 8).toUpperCase();

        Saga saga = new Saga(new Saga.Options.Builder().build());

        try {
            // Step 1: Charge Card
            activities.chargeCreditCard(travelRequest, amount, paymentId);
            // Register compensation in payment saga
            saga.addCompensation(() -> activities.refundCreditCard(travelRequest, amount, paymentId));

            // Step 2: Issue Invoice
            activities.issueInvoice(travelRequest, amount, paymentId);

            // Step 3: Award Loyalty Points (Calculated dynamically: 10 points per dollar)
            int points = (int) (amount * 10);
            activities.awardLoyaltyPoints(travelRequest, points, loyaltyId);

        } catch (Exception e) {
            // Revert payment steps locally in the payment child workflow saga
            saga.compensate();
            throw e; // propagate failure back to parent TravelWorkflow
        }
    }
}
