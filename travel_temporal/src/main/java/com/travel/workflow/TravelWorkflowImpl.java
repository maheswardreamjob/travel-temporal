package com.travel.workflow;

import com.travel.activities.TravelActivities;
import com.travel.dto.TravelRequest;
import io.temporal.activity.ActivityOptions;
import io.temporal.common.RetryOptions;
import io.temporal.workflow.Saga;
import io.temporal.workflow.SignalMethod;
import io.temporal.workflow.Workflow;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Duration;

@Service
@Slf4j
public class TravelWorkflowImpl implements TravelWorkflow {


    private boolean isUserConfirmed = false;
    private boolean isUserCancelled = false;
    private String status = "PENDING_START";

    @SignalMethod
    public void sendConfirmationSignal() {
        log.info("📩 Received user confirmation signal.");
        isUserConfirmed = true;
    }

    @SignalMethod
    public void sendCancellationSignal() {
        log.info("🛑 Received user cancellation signal.");
        isUserCancelled = true;
    }

    @Override
    public String getStatus() {
        return this.status;
    }

    @Override
    public void bookTrip(TravelRequest travelRequest) {

        log.info("🚀 Starting travel booking for user: {}", travelRequest.getUserId());

        TravelActivities activities = Workflow.newActivityStub(TravelActivities.class,
                ActivityOptions.newBuilder()
                        .setRetryOptions(RetryOptions.newBuilder()
                                .setMaximumAttempts(4)
                                .build())
                        .setStartToCloseTimeout(Duration.ofSeconds(10))
                        .build());

        Saga.Options sagaOptions = new Saga.Options.Builder()
                .setParallelCompensation(false)
                .build();

        Saga saga = new Saga(sagaOptions);

        try {

            this.status = "FLIGHT_BOOKING_IN_PROGRESS";
            activities.bookFlight(travelRequest);
            saga.addCompensation(() -> {
                this.status = "COMPENSATING_FLIGHT";
                activities.cancelFlight(travelRequest);
            });

            this.status = "HOTEL_BOOKING_IN_PROGRESS";
            activities.bookHotel(travelRequest);
            saga.addCompensation(() -> {
                this.status = "COMPENSATING_HOTEL";
                activities.cancelHotel(travelRequest);
            });

            this.status = "TRANSPORT_ARRANGING_IN_PROGRESS";
            activities.arrangeTransport(travelRequest);
            saga.addCompensation(() -> {
                this.status = "COMPENSATING_TRANSPORT";
                activities.cancelTransport(travelRequest);
            });

            // Wait for user confirmation for up to 2 minutes. If no signal is
            // received within that window we trigger compensation to cancel
            // any booked resources.
            log.info("⏳ Waiting for user confirmation for 1 minute...");
            this.status = "PENDING_USER_CONFIRMATION";

            boolean isConfirmed = Workflow.await(
                    Duration.ofMinutes(1),
                    () -> isUserConfirmed || isUserCancelled
            );

            if (!isConfirmed || isUserCancelled) {
                if (isUserCancelled) {
                    log.info("User cancelled the booking, initiating compensation for user: {}", travelRequest.getUserId());
                } else {
                    log.info("User did not confirm within 1 minute, initiating compensation for user: {}", travelRequest.getUserId());
                }
                this.status = "COMPENSATING";
                // Run registered compensations (cancel flight/hotel/transport)
                saga.compensate();
                this.status = "CANCELLED";
                // Optionally call an aggregate cancellation activity if you have
                // additional cleanup (uncomment if needed):
                // activities.cancelBooking(travelRequest);
            } else {
                log.info("✅ User confirmed the booking: {}", travelRequest.getUserId());
                // confirm the booking
                activities.confirmBooking(travelRequest);
                this.status = "CONFIRMED";
            }


        } catch (Exception e) {
            log.error("❌ Error during travel booking for user: {}. Initiating compensation.", travelRequest.getUserId());
            this.status = "COMPENSATING";
            saga.compensate();
            this.status = "CANCELLED";
        }

        log.info("✅ Travel booking completed for user: {}", travelRequest.getUserId());

    }
}
