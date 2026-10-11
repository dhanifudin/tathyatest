<?php

// Plain-text labels: the stock strings carry HTML entities ("Next &raquo;") that Laravel's
// paginator copies into aria-label, so the accessible name would differ from the visible arrow.
return [
    'previous' => 'Previous',
    'next' => 'Next',
];
